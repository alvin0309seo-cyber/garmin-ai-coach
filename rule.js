function getBaseRecommendation(garminData) {
    const {
        sleepScore,
        hrvStatus,
        restingHeartRate,
        restingHR7dAvg,
        stressLevel
    } = garminData;

    // ── 회복 지표 판정 기준 (실측 필드 기준) ────────────────────────
    // hrvStatus 실제 문자열: "BALANCED" / "UNBALANCED" / "LOW" / "POOR" / "NONE" / "NO_DATA"
    //   - 명확한 회복 부진: UNBALANCED / LOW / POOR
    //   - 미측정(중립):     NONE / NO_DATA / null → 고강도를 막지도, 저강도를 만들지도 않음
    const HRV_UNBALANCED = ['UNBALANCED', 'LOW', 'POOR'];
    const HRV_NEUTRAL = ['NONE', 'NO_DATA'];

    // ── 회복 부진(빨간불) 신호 — 하나라도 걸리면 Low(휴식) ──────────
    const poorSleep = sleepScore != null && sleepScore < 50;                       // 수면 부족
    const hrvUnbalanced = HRV_UNBALANCED.includes(hrvStatus);                      // HRV 불균형
    const elevatedRhr =                                                             // 안정시 심박 7일평균+5 이상(피로)
        restingHeartRate != null && restingHR7dAvg != null &&
        restingHeartRate >= restingHR7dAvg + 5;
    const highStress = stressLevel != null && stressLevel > 50;                    // 스트레스 과다

    // ── 회복 최상(파란불) 신호 — 전부 충족 시 High(고강도) ──────────
    const goodSleep = sleepScore != null && sleepScore >= 75;                      // 수면 양호
    const hrvRecovered = hrvStatus === 'BALANCED' || HRV_NEUTRAL.includes(hrvStatus) || hrvStatus == null; // HRV 균형(또는 미측정)
    const stableRhr =                                                               // 안정시 심박 ≤ 7일평균+2
        restingHeartRate != null && restingHR7dAvg != null &&
        restingHeartRate <= restingHR7dAvg + 2;
    const lowStress = stressLevel != null && stressLevel < 35;                     // 스트레스 낮음

    // ── 판정 ────────────────────────────────────────────────────────
    if (poorSleep || hrvUnbalanced || elevatedRhr || highStress) {
        return {
            intensity: "Low",
            guideline: "전신 휴식 및 폼롤러 스트레칭. 웨이트 트레이닝과 러닝은 쉴 것."
        };
    }

    if (goodSleep && hrvRecovered && stableRhr && lowStress) {
        return {
            intensity: "High",
            guideline: "고강도 인터벌 러닝 및 스트랩을 활용한 강도 높은 등 웨이트 트레이닝 (풀업 포함)."
        };
    }

    return {
        intensity: "Medium",
        guideline: "가벼운 5km 조깅 또는 중량 욕심 없는 맨몸운동 위주 세션."
    };
}

module.exports = { getBaseRecommendation };
