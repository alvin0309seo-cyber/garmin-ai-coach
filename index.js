require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getGarminData } = require('./garmin');
const { getBaseRecommendation } = require('./rule');
const { getAiRecommendation } = require('./ai'); // 새로 추가된 모듈

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/api/daily-plan', async (req, res) => {
    try {
        console.log("1. 가민 데이터 수집 시작...");
        const garminData = await getGarminData();
        
        console.log("2. 1차 추천 로직 계산 중...");
        const recommendation = getBaseRecommendation(garminData);

        console.log("3. Gemini AI 코치에게 맞춤형 계획 요청 중...");
        const aiPlan = await getAiRecommendation(garminData, recommendation);

        // 프론트엔드로 보낼 최종 데이터 세트
        const finalResponse = {
            garmin: garminData,
            systemRule: recommendation,
            aiCoach: aiPlan // AI의 응답 포함
        };

        res.json(finalResponse);
        console.log("완료! 데이터를 성공적으로 전송했습니다.");

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "데이터를 처리하는 중 문제가 발생했습니다." });
    }
});

app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});