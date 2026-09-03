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

async function getGarminData() {
    try {
        const gcClient = new GarminConnect({
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

        // 화면에 보여주기 위한 텍스트(YYYY-MM-DD) 만들기
        const kstDate = new Date(today.getTime() + (9 * 60 * 60 * 1000));
        const dateString = kstDate.toISOString().split('T')[0];

        // 🚨 핵심 수정: dateString(글씨) 대신 today(날짜 객체)를 통째로 집어넣습니다!
        const sleepData = await fetchWithRetry(() => gcClient.getSleepData(today), '수면');
        const heartRateData = await fetchWithRetry(() => gcClient.getHeartRate(today), '심박');

        return {
            date: dateString,
            bodyBattery: 50,
            sleepScore: sleepData?.dailySleepDTO?.sleepScore || 50,
            restingHeartRate: heartRateData?.restingHeartRate || 60
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
