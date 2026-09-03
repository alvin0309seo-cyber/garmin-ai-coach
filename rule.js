function getBaseRecommendation(garminData, inbodyData = null) {
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

    // 🚨 핵심: 인바디 체성분 데이터는 intensity(Low/Med/High) 판정에는 영향 없음.
    //    회복지표 기반 강도 판정은 그대로 유지하고, 인바디는 guideline 텍스트에만 추가.
    const inbodyNotes = inbodyData ? buildInbodyGuidelines(garminData, inbodyData) : [];
    const guidelineSuffix = inbodyNotes.length > 0
        ? ' [체성분 참고] ' + inbodyNotes.join(' ')
        : '';

    // ── 판정 ────────────────────────────────────────────────────────
    if (poorSleep || hrvUnbalanced || elevatedRhr || highStress) {
        return {
            intensity: "Low",
            guideline: "전신 휴식 및 폼롤러 스트레칭. 웨이트 트레이닝과 러닝은 쉴 것." + guidelineSuffix
        };
    }

    if (goodSleep && hrvRecovered && stableRhr && lowStress) {
        return {
            intensity: "High",
            guideline: "고강도 인터벌 러닝 및 스트랩을 활용한 강도 높은 등 웨이트 트레이닝 (풀업 포함)." + guidelineSuffix
        };
    }

    return {
        intensity: "Medium",
        guideline: "가벼운 5km 조깅 또는 중량 욕심 없는 맨몸운동 위주 세션." + guidelineSuffix
    };
}

// ── 인바디 체성분 기반 가이드라인 (주의사항) 생성 ─────────────────────
// 입력된 체성분 값만 보고 부족/불균형을 감지. null/미측정 항목은 건너뜀.
function buildInbodyGuidelines(garminData, inbodyData) {
    const notes = [];
    const seg = inbodyData.segmental || {};
    const imp = inbodyData.impedance || {};

    // 1) 좌우 근육 불균형 — segmental 좌우 차이 1kg 이상, 또는 impedance 좌우 차이 20% 이상
    const armSegDiff = diffAbs(seg.rightArmKg, seg.leftArmKg);
    const legSegDiff = diffAbs(seg.rightLegKg, seg.leftLegKg);
    const armImpDiffPct = pctDiff(imp.rightArm, imp.leftArm);
    const legImpDiffPct = pctDiff(imp.rightLeg, imp.leftLeg);

    const imbalance = (armSegDiff != null && armSegDiff >= 1)
        || (legSegDiff != null && legSegDiff >= 1)
        || (armImpDiffPct != null && armImpDiffPct >= 20)
        || (legImpDiffPct != null && legImpDiffPct >= 20);
    if (imbalance) notes.push("⚠️ 좌우 근육 불균형 감지 — 약한 쪽을 먼저 운동할 것");

    // 2) 체지방률 높음 — 남성 25%+, 여성 35%+
    const genderText = (inbodyData.gender || garminData.gender || '').toString();
    const isMale = /남|male/i.test(genderText);
    const bf = num(inbodyData.bodyFatPct);
    if (bf != null && ((isMale && bf >= 25) || (!isMale && bf >= 35))) {
        notes.push("유산소 비중↑");
    }

    // 3) 골격근량 부족 — 체중 대비 골격근 비율 기준 (남 <42%, 여 <33% — 조정 가능)
    const w = num(inbodyData.weightKg);
    const skm = num(inbodyData.skeletalMuscleKg);
    if (w > 0 && skm != null) {
        const skmPct = (skm / w) * 100;
        const threshold = isMale ? 42 : 33;
        if (skmPct < threshold) notes.push("근비대 위주");
    }

    return notes;
}

// 숫자만 안전하게 추출 (문자열/NaN/null → null)
function num(v) {
    return (typeof v === 'number' && isFinite(v)) ? v : null;
}

// 두 값의 절대 차이 (한쪽이라도 없으면 null)
function diffAbs(a, b) {
    const A = num(a), B = num(b);
    return (A != null && B != null) ? Math.abs(A - B) : null;
}

// 두 값의 상대 차이(%) — 작은 쪽 기준 (한쪽이라도 없거나 0 이하이면 null)
function pctDiff(a, b) {
    const A = num(a), B = num(b);
    if (A == null || B == null || Math.min(A, B) <= 0) return null;
    return (Math.abs(A - B) / Math.min(A, B)) * 100;
}

module.exports = { getBaseRecommendation };
