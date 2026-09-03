require('dotenv').config();
const { GarminConnect } = require('garmin-connect');
const { cleanEnv } = require('./env');

// 🚨 핵심 수정: 에러에서 HTTP 상태 코드를 안전하게 추출한다.
//    garmin-connect는 429/5xx를 "ERROR: (429), ..." 형태의 Error로 감싸 던지므로
//    response.status 뿐 아니라 메시지 내 "(NNN)" 까지 확인해야 재시도가 실제로 동작한다.
function getStatus(err) {
    if (!err) return undefined;
    if (err.response && err.response.status) return err.response.status;
    if (err.statusCode) return err.statusCode;
    const m = /\((\d{3})\)/.exec(err.message || '');
    return m ? parseInt(m[1], 10) : undefined;
}

function isRetryable(status) {
    return status === 429 || (status >= 500 && status <= 599);
}

// 🚨 핵심 수정: 데이터 조회 단계 429/5xx 재시도 (최대 3회, 지수 백오프)
//    데이터센터 IP에서 일시적 rate-limit이 걸려도 복구 기회를 준다.
async function fetchWithRetry(fn, label) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const status = getStatus(err);
            if (isRetryable(status)) {
                if (attempt < 3) {
                    const delay = 5000 * Math.pow(2, attempt - 1); // 5s, 10s
                    console.warn(`⚠️ 가민 ${label} 데이터 조회 ${status} 응답 — ${attempt}/3회 재시도 대기 중 (${delay}ms)...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
            }
            throw err;
        }
    }
    throw lastError;
}

// 🚨 핵심: 항목별 독립 수집. 하나가 실패해도(null 폴백) 전체 파이프라인이 죽지 않게.
async function safe(label, fn) {
    try {
        return await fn();
    } catch (err) {
        console.warn(`⚠️ 가민 ${label} 수집 실패 → null (계속 진행): ${err.message}`);
        return null;
    }
}

// 소수 1자리 반올림 (null/undefined 통과)
function round1(n) {
    return n == null ? null : Math.round(n * 10) / 10;
}
// 정수 반올림 (null/undefined 통과)
function roundInt(n) {
    return n == null ? null : Math.round(n);
}
// 소수 2자리 반올림 (null/undefined 통과)
function round2(n) {
    return n == null ? null : Math.round(n * 100) / 100;
}

// 생년월일(YYYY-MM-DD)로 만 나이 계산
function computeAge(birthDate) {
    if (!birthDate) return null;
    const b = new Date(birthDate);
    if (isNaN(b.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
}

async function getGarminData() {
    let gcClient;
    try {
        gcClient = new GarminConnect({
            username: cleanEnv('GARMIN_USERNAME'),
            password: cleanEnv('GARMIN_PASSWORD')
        });

        // 🚨 핵심 수정: 저장된 OAuth 토큰(oauth1+oauth2)이 있으면 login()을 완전히 생략.
        //    oauth2 만료 시 라이브러리가 oauth1 토큰으로 exchange 자동 재발급(차단되지 않는 엔드포인트).
        const storedTokens = cleanEnv('GARMIN_TOKENS');
        if (storedTokens) {
            let tokens;
            try {
                tokens = JSON.parse(storedTokens);
            } catch (e) {
                throw new Error('GARMIN_TOKENS JSON 파싱 실패 (형식 확인 필요)');
            }
            if (!tokens || !tokens.oauth1 || !tokens.oauth2) {
                throw new Error('GARMIN_TOKENS에 oauth1/oauth2 키가 없습니다.');
            }
            // 🚨 토큰 값은 어떤 경우에도 로그에 출력하지 않음.
            gcClient.loadToken(tokens.oauth1, tokens.oauth2);
            console.log('가민 토큰 주입 성공 (login 생략)');
        } else {
            // 로컬 개발용 fallback: 기존 login() + 429 재시도 유지
            let lastError = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await gcClient.login();
                    break; // 로그인 성공
                } catch (loginErr) {
                    lastError = loginErr;
                    const status = getStatus(loginErr);
                    if (status === 429) {
                        console.warn(`⚠️ 가민 429 (Too Many Requests) — ${attempt}/3회 재시도 대기 중...`);
                        if (attempt < 3) {
                            const delay = 5000 * Math.pow(2, attempt - 1); // 5s, 10s
                            await new Promise(r => setTimeout(r, delay));
                            continue;
                        }
                    }
                    // 429가 아닌 다른 에러는 즉시 상위 catch로 전파
                    throw loginErr;
                }
            }
            console.log('가민 로그인 성공!');
        }

        // 🚨 글씨가 아닌 진짜 '날짜(Date) 객체'를 만듭니다.
        const today = new Date();

        // 화면에 보여주기 위한 텍스트(YYYY-MM-DD) 만들기 (KST)
        const kstDate = new Date(today.getTime() + (9 * 60 * 60 * 1000));
        const dateString = kstDate.toISOString().split('T')[0];

        // ─────────────────────────────────────────────────────────────
        // 각 데이터 소스를 독립적으로 수집 (하나 실패해도 null, 파이프라인 생존)
        // ─────────────────────────────────────────────────────────────
        const sleepData = await safe('수면', () => fetchWithRetry(() => gcClient.getSleepData(today), '수면'));
        const heartRateData = await safe('심박', () => fetchWithRetry(() => gcClient.getHeartRate(today), '심박'));
        const steps = await safe('걸음수', () => fetchWithRetry(() => gcClient.getSteps(today), '걸음수'));
        const weightData = await safe('체성분', () => fetchWithRetry(() => gcClient.getDailyWeightData(today), '체성분'));
        // 🚨 수분: 라이브러리 getDailyHydration()은 valueInML이 0이면 falsy라 throw 하고,
        //    정상이어도 온스(oz)로 변환해 반환한다. 따라서 raw 엔드포인트로 valueInML/goal/sweat를 직접 읽는다.
        const hydrationRaw = await safe('수분', () => fetchWithRetry(
            () => gcClient.get('https://connectapi.garmin.com/usersummary-service/usersummary/hydration/allData/' + dateString),
            '수분'
        ));
        // 🚨 프로필: getUserProfile()(socialProfile)에는 나이/성별/키/몸무게가 없어서
        //    getUserSettings()(userprofile-service)의 userData에서 읽는다.
        const settings = await safe('프로필', () => fetchWithRetry(() => gcClient.getUserSettings(), '프로필'));
        const activities = await safe('최근활동', () => fetchWithRetry(() => gcClient.getActivities(0, 5), '활동'));
        // 🚨 스트레스: raw wellness-service dailyStress
        const stressData = await safe('스트레스', () => fetchWithRetry(
            () => gcClient.get('https://connectapi.garmin.com/wellness-service/wellness/dailyStress/' + dateString),
            '스트레스'
        ));

        // ─────────────────────────────────────────────────────────────
        // 필드 매핑 (실측한 실제 필드명·단위 기준)
        // ─────────────────────────────────────────────────────────────

        // 수면 — sleepScore는 dailySleepDTO.sleepScores.overall.value 에 있음
        //       (dailySleepDTO.sleepScore 는 존재하지 않음 → 기존 코드는 항상 50 폴백이었음)
        const dto = sleepData?.dailySleepDTO;

        // 심박
        const heartRate = {
            restingHeartRate: heartRateData?.restingHeartRate ?? null,
            maxHeartRate: heartRateData?.maxHeartRate ?? null,
            minHeartRate: heartRateData?.minHeartRate ?? null,
            restingHR7dAvg: heartRateData?.lastSevenDaysAvgRestingHeartRate ?? null
        };

        // 수면
        const sleep = {
            sleepScore: dto?.sleepScores?.overall?.value ?? null,
            sleepDurationHours: round1(dto?.sleepTimeSeconds != null ? dto.sleepTimeSeconds / 3600 : null),
            deepSleepMin: roundInt(dto?.deepSleepSeconds != null ? dto.deepSleepSeconds / 60 : null),
            lightSleepMin: roundInt(dto?.lightSleepSeconds != null ? dto.lightSleepSeconds / 60 : null),
            remSleepMin: roundInt(dto?.remSleepSeconds != null ? dto.remSleepSeconds / 60 : null),
            awakeMin: roundInt(dto?.awakeSleepSeconds != null ? dto.awakeSleepSeconds / 60 : null),
            awakeCount: dto?.awakeCount ?? null,
            sleepStress: dto?.avgSleepStress ?? null,
            respirationAvg: dto?.averageRespirationValue ?? null,
            sleepFeedback: dto?.sleepScoreFeedback ?? null
        };

        // HRV — 수면 데이터 최상위 필드에 이미 존재
        const hrv = {
            avgOvernightHrv: sleepData?.avgOvernightHrv ?? null,
            hrvStatus: sleepData?.hrvStatus ?? null
        };

        // 스트레스 — dailyStress 일평균 (avgStressLevel)
        const stressLevel = stressData?.avgStressLevel ?? null;

        // 활동 — 최근 5개 (최근→과거 순, getActivities(0,5)가 이미 최신순)
        const recentActivities = (activities ?? []).map(a => ({
            type: a.activityType?.typeKey ?? null,
            name: a.activityName ?? null,
            startTime: a.startTimeLocal ?? null,
            distanceKm: round2(a.distance != null ? a.distance / 1000 : null), // meters → km
            durationMin: round1(a.duration != null ? a.duration / 60 : null),  // seconds → min
            avgHr: a.averageHR ?? null,
            calories: a.calories ?? null,
            trainingEffect: a.aerobicTrainingEffect ?? null
        }));

        // 체성분 — weight-service dayview totalAverage (단위: mass는 그램, bodyFat는 %)
        const ta = weightData?.totalAverage;
        const body = {
            weightKg: ta?.weight != null ? round1(ta.weight / 1000) : null,        // g → kg
            bodyFatPct: ta?.bodyFat ?? null,                                        // %
            muscleMassKg: ta?.muscleMass != null ? round1(ta.muscleMass / 1000) : null, // g → kg
            bmi: ta?.bmi ?? null,
            visceralFat: ta?.visceralFat ?? null,
            metabolicAge: ta?.metabolicAge ?? null
        };

        // 수분 — raw hydration allData (단위: mL)
        const hydration = {
            hydrationML: hydrationRaw?.valueInML ?? null,
            hydrationGoalML: hydrationRaw?.goalInML ?? null,
            sweatLossML: hydrationRaw?.sweatLossInML ?? null
        };

        // 프로필 — userData (무게는 그램 → kg, 키는 cm, 성별 문자열)
        const ud = settings?.userData;
        const profile = {
            age: computeAge(ud?.birthDate),
            gender: ud?.gender ?? null,
            activityClass: ud?.activityClass ?? ud?.activityLevel ?? null,
            heightCm: ud?.height ?? null,
            profileWeightKg: ud?.weight != null ? round1(ud.weight / 1000) : null, // g → kg
            vo2Max: ud?.vo2MaxRunning ?? null
        };

        return {
            date: dateString,
            ...heartRate,
            ...sleep,
            ...hrv,
            stressLevel,
            steps: steps ?? null,
            recentActivities,
            ...body,
            ...hydration,
            ...profile
        };

    } catch (error) {
        // 🚨 핵심 수정: 에러 메시지를 더 명확하게 개선
        const status = getStatus(error);
        if (status === 429) {
            console.error('❌ 가민 API 429: 요청 한도 초과. 잠시 후 다시 시도하세요.');
        } else if (status === 401 || status === 403) {
            console.error('❌ 가민 인증 실패: 토큰 만료 또는 자격 정보 오류 (2FA/CAPTCHA 차단 가능).');
        }
        console.error('가민 데이터를 가져오는 중 오류 발생:', error.message);
        throw new Error(`가민 데이터 수집 실패: ${error.message}`);
    }
}

module.exports = { getGarminData };
