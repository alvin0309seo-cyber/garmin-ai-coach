function getBaseRecommendation(garminData) {
    const { bodyBattery, sleepScore } = garminData;

    // 수면 점수나 바디 배터리가 매우 낮을 때 (휴식 권장)
    if (bodyBattery < 40 || sleepScore < 50) {
        return {
            intensity: "Low",
            guideline: "전신 휴식 및 폼롤러 스트레칭. 웨이트 트레이닝과 러닝은 쉴 것."
        };
    } 
    // 컨디션이 보통일 때 (중강도)
    else if (bodyBattery < 75 || sleepScore < 75) {
        return {
            intensity: "Medium",
            guideline: "가벼운 5km 조깅 또는 중량 욕심 없는 맨몸운동 위주 세션."
        };
    } 
    // 컨디션이 최상일 때 (고강도)
    else {
        return {
            intensity: "High",
            guideline: "고강도 인터벌 러닝 및 스트랩을 활용한 강도 높은 등 웨이트 트레이닝 (풀업 포함)."
        };
    }
}

module.exports = { getBaseRecommendation };