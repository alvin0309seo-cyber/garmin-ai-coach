require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getGarminData } = require('./garmin');
const { getBaseRecommendation } = require('./rule');
const { getAiRecommendation } = require('./ai');

const app = express();

// 🚨 핵심 수정 부분: Render가 알아서 포트를 배정하도록 변경합니다.
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/daily-plan', async (req, res) => {
    try {
        console.log("1. 가민 데이터 수집 시작...");
        
        // --- 🚨 [가민 서버 차단 방지용 세팅] ---
        // 가민 서버가 429 에러로 차단했을 때는 아래 1줄을 주석(//) 처리하고, 
        // 그 아래에 있는 가짜 데이터 주석(/* */)을 풀어서 사용하세요!
        
        const garminData = await getGarminData(); 
        
        /* [가짜 데이터 시작] - 필요할 때만 주석을 지우고 사용하세요.
        const garminData = {
            date: "2026-08-07",
            bodyBattery: 50,
            sleepScore: 50,
            restingHeartRate: 44
        };
        [가짜 데이터 끝] */
        // ----------------------------------------

        console.log("2. 1차 추천 로직 계산 중...");
        const recommendation = getBaseRecommendation(garminData);

        console.log("3. Gemini AI 코치에게 맞춤형 계획 요청 중...");
        const aiPlan = await getAiRecommendation(garminData, recommendation);

        // 프론트엔드로 보낼 최종 데이터 세트
        const finalResponse = {
            garmin: garminData,
            systemRule: recommendation,
            aiCoach: aiPlan
        };

        res.json(finalResponse);
        console.log("완료! 데이터를 성공적으로 전송했습니다.");

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "데이터를 처리하는 중 문제가 발생했습니다." });
    }
});

// 🚨 핵심 수정 부분: 콘솔 로그도 동적 포트를 표시하도록 변경합니다.
app.listen(PORT, () => {
    console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});