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

// null/undefined → "미측정" 으로 안전하게 표기 (AI 프롬프트용)
function fmt(v, unit) {
    if (v === null || v === undefined) return '미측정';
    return unit ? `${v}${unit}` : `${v}`;
}

async function getAiRecommendation(garminData, systemRule) {
    // 🚨 핵심 수정: gemini-2.5-flash 가 더 이상 신규 사용자에게 제공되지 않아 404 발생.
    // gemini-3.6-flash 로 업데이트 (Google 권장).
    const model = genAI.getGenerativeModel({
        model: "gemini-3.6-flash",
        generationConfig: {
            responseMimeType: "application/json", // 핵심: 무조건 JSON 형태로만 답하도록 강제
        }
    });

    // 최근 활동 리스트(최근→과거)를 AI가 읽기 좋게 한 줄 요약
    const acts = (garminData.recentActivities || [])
        .map((a, i) => {
            const parts = [];
            if (a.name) parts.push(a.name);
            if (a.type) parts.push(`(${a.type})`);
            if (a.distanceKm != null) parts.push(`${a.distanceKm}km`);
            if (a.durationMin != null) parts.push(`${a.durationMin}분`);
            if (a.avgHr != null) parts.push(`평균심박 ${a.avgHr}bpm`);
            if (a.calories != null) parts.push(`${a.calories}kcal`);
            return `${i + 1}. ${parts.join(' ') || '정보 없음'}`;
        })
        .join('\n    ') || '최근 기록 없음';

    // AI에게 전달할 프롬프트(명령어)
    const prompt = `
    너는 나의 1:1 전담 퍼스널 트레이너야.
    오늘 나의 가민 수치는 다음과 같아:

    [기본]
    - 날짜: ${garminData.date}

    [심박]
    - 안정시 심박수: ${fmt(garminData.restingHeartRate, 'bpm')}
    - 최고 심박수: ${fmt(garminData.maxHeartRate, 'bpm')}
    - 최저 심박수: ${fmt(garminData.minHeartRate, 'bpm')}
    - 최근 7일 평균 안정시 심박수: ${fmt(garminData.restingHR7dAvg, 'bpm')}

    [수면]
    - 수면 점수: ${fmt(garminData.sleepScore, '/100')}
    - 총 수면 시간: ${fmt(garminData.sleepDurationHours, '시간')}
    - 깊은 수면: ${fmt(garminData.deepSleepMin, '분')}
    - 얕은 수면: ${fmt(garminData.lightSleepMin, '분')}
    - REM 수면: ${fmt(garminData.remSleepMin, '분')}
    - 깨어있던 시간: ${fmt(garminData.awakeMin, '분')}
    - 깨어난 횟수: ${fmt(garminData.awakeCount, '회')}
    - 수면 중 평균 스트레스: ${fmt(garminData.sleepStress)}
    - 평균 호흡수: ${fmt(garminData.respirationAvg, '회/분')}
    - 수면 피드백: ${fmt(garminData.sleepFeedback)}

    [HRV (심박 변이도)]
    - 평균 야간 HRV: ${fmt(garminData.avgOvernightHrv, 'ms')}
    - HRV 상태: ${fmt(garminData.hrvStatus)}

    [스트레스]
    - 오늘 평균 스트레스 레벨: ${fmt(garminData.stressLevel)}

    [활동]
    - 오늘 걸음 수: ${fmt(garminData.steps, '보')}
    - 최근 활동 (최근→과거):
    ${acts}

    [체성분]
    - 체중: ${fmt(garminData.weightKg, 'kg')}
    - 체지방률: ${fmt(garminData.bodyFatPct, '%')}
    - 골격근량: ${fmt(garminData.muscleMassKg, 'kg')}
    - BMI: ${fmt(garminData.bmi)}
    - 내장지방: ${fmt(garminData.visceralFat)}
    - 신체 나이: ${fmt(garminData.metabolicAge, '세')}

    [수분]
    - 오늘 수분 섭취: ${fmt(garminData.hydrationML, 'ml')}
    - 수분 목표: ${fmt(garminData.hydrationGoalML, 'ml')}
    - 땀으로 잃은 수분(추정): ${fmt(garminData.sweatLossML, 'ml')}

    [프로필]
    - 나이: ${fmt(garminData.age, '세')}
    - 성별: ${fmt(garminData.gender)}
    - 신장: ${fmt(garminData.heightCm, 'cm')}
    - 프로필 기준 체중: ${fmt(garminData.profileWeightKg, 'kg')}
    - VO2Max: ${fmt(garminData.vo2Max)}

    시스템이 계산한 오늘의 1차 가이드라인은 다음과 같아:
    - 권장 강도: ${systemRule.intensity}
    - 시스템 제안: ${systemRule.guideline}

    나는 평소 5km 이상의 러닝과 풀업, 푸시업을 포함한 웨이트 트레이닝을 즐겨 해.
    위 데이터를 바탕으로 오늘 수행할 구체적인 운동 계획을 JSON 형식으로 작성해 줘.
    ("미측정"으로 표시된 항목은 무시하고, 실제 측정된 값만으로 판단해.)

    출력 형식 (반드시 아래 JSON 스키마를 따를 것):
    {
      "greeting": "오늘 회복 상태와 체력 데이터에 맞춘 친근하고 동기부여가 되는 짧은 인사말",
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
