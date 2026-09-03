require('dotenv').config();
const { GarminConnect } = require('garmin-connect');
const { cleanEnv } = require('./env');

async function getGarminData() {
    try {
        const gcClient = new GarminConnect({
            username: cleanEnv('GARMIN_USERNAME'),
            password: cleanEnv('GARMIN_PASSWORD')
        });
        
        // 🚨 핵심 수정: 429(Too Many Requests) 대응 — 최대 3회 재시도 + 지수 백오프
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await gcClient.login();
                break; // 로그인 성공
            } catch (loginErr) {
                lastError = loginErr;
                const status = loginErr.response?.status || loginErr.statusCode;
                if (status === 429) {
                    console.warn(`⚠️ 가민 429 (Too Many Requests) — ${attempt}/3회 재시도 대기 중...`);
                    if (attempt < 3) {
                        const delay = 5000 * Math.pow(2, attempt - 1); // 5s, 10s, 20s
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                }
                // 429가 아닌 다른 에러는 즉시 상위 catch로 전파
                throw loginErr;
            }
        }
        
        console.log("가민 로그인 성공!");
        
        // 🚨 글씨가 아닌 진짜 '날짜(Date) 객체'를 만듭니다.
        const today = new Date();
        
        // 화면에 보여주기 위한 텍스트(YYYY-MM-DD) 만들기
        const kstDate = new Date(today.getTime() + (9 * 60 * 60 * 1000)); 
        const dateString = kstDate.toISOString().split('T')[0];

        // 🚨 핵심 수정: dateString(글씨) 대신 today(날짜 객체)를 통째로 집어넣습니다!
        const sleepData = await gcClient.getSleepData(today);
        const heartRateData = await gcClient.getHeartRate(today);

        return {
            date: dateString,
            bodyBattery: 50, 
            sleepScore: sleepData?.dailySleepDTO?.sleepScore || 50,
            restingHeartRate: heartRateData?.restingHeartRate || 60
        };

    } catch (error) {
        // 🚨 핵심 수정: 에러 메시지를 더 명확하게 개선
        const status = error.response?.status || error.statusCode;
        if (status === 429) {
            console.error("❌ 가민 API 429: 요청 한도 초과. 잠시 후 다시 시도하세요.");
        } else if (status === 401 || status === 403) {
            console.error("❌ 가민 로그인 실패: 인증 정보를 확인하세요 (2FA/CAPTCHA 차단 가능).");
        }
        console.error("가민 데이터를 가져오는 중 오류 발생:", error.message);
        throw new Error(`가민 데이터 수집 실패: ${error.message}`);
    }
}

module.exports = { getGarminData };