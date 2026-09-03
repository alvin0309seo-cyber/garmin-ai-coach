require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { cleanEnv } = require('./env');

// Gemini API 초기화 (미리 발급받은 키 사용)
// 🚨 핵심 수정: .env/OS/시크릿 어디서 왔든 따옴표·공백을 벗긴 키를 사용
const apiKey = cleanEnv('GEMINI_API_KEY');
if (!apiKey) {
    throw new Error('❌ GEMINI_API_KEY 환경변수가 없습니다. .env 또는 GitHub Actions 시크릿을 확인하세요.');
}
const genAI = new GoogleGenerativeAI(apiKey);

async function getAiRecommendation(garminData, systemRule) {
    // 🚨 핵심 수정: gemini-2.5-flash 가 더 이상 신규 사용자에게 제공되지 않아 404 발생.
    // gemini-3.6-flash 로 업데이트 (Google 권장).
    const model = genAI.getGenerativeModel({
        model: "gemini-3.6-flash",
        generationConfig: {
            responseMimeType: "application/json", // 핵심: 무조건 JSON 형태로만 답하도록 강제
        }
    });

    // AI에게 전달할 프롬프트(명령어)
    const prompt = `
    너는 나의 1:1 전담 퍼스널 트레이너야.
    오늘 나의 가민 수치는 다음과 같아:
    - 날짜: ${garminData.date}
    - 바디 배터리: ${garminData.bodyBattery}/100
    - 수면 점수: ${garminData.sleepScore}/100
    - 안정시 심박수: ${garminData.restingHeartRate}bpm

    시스템이 계산한 오늘의 1차 가이드라인은 다음과 같아:
    - 권장 강도: ${systemRule.intensity}
    - 시스템 제안: ${systemRule.guideline}

    나는 평소 5km 이상의 러닝과 풀업, 푸시업을 포함한 웨이트 트레이닝을 즐겨 해.
    위 데이터를 바탕으로 오늘 수행할 구체적인 운동 계획을 JSON 형식으로 작성해 줘.

    출력 형식 (반드시 아래 JSON 스키마를 따를 것):
    {
      "greeting": "오늘 수면 점수와 바디 배터리에 맞춘 친근하고 동기부여가 되는 짧은 인사말",
      "workoutType": "러닝 / 웨이트 트레이닝 / 휴식 중 택 1",
      "routines": [
        { "name": "운동 종목명 (예: 푸시업, 5km 가벼운 러닝)", "sets": "세트 수 (숫자 또는 러닝 시 '-')", "reps": "횟수 또는 시간" }
      ],
      "coachComment": "운동 시 주의할 점이나 팁"
    }
    `;

  try {
        const result = await model.generateContent(prompt);
        const rawText = await result.response.text();
        
        // 1. AI가 가끔 실수로 붙이는 앞뒤 마크다운 기호를 깔끔하게 잘라냅니다.
        const cleanText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
        
        return JSON.parse(cleanText);

    } catch (error) {
        console.error("Gemini API 또는 JSON 변환 오류 발생:", error.message);
        
        // 2. 🚨 핵심: AI가 오타를 내서 에러가 발생해도 화면이 하얗게 터지지 않도록,
        // 임시 '비상용 데이터'를 만들어서 프론트엔드로 무사히 내려보냅니다.
        return {
            greeting: "AI 코치와 잠시 연결이 불안정합니다. 기본 루틴을 제안해 드립니다!",
            workoutType: "유연성 훈련 및 휴식",
            routines: [
                { name: "전신 가벼운 스트레칭", sets: "-", reps: "10분" },
                { name: "수분 섭취 및 컨디션 조절", sets: "-", reps: "자유롭게" }
            ],
            coachComment: "데이터를 분석하는 과정에서 약간의 지연이 발생했습니다. 오늘은 무리하지 마시고 컨디션에 맞춰 가볍게 몸을 풀어주세요."
        };
    }
}

module.exports = { getAiRecommendation };