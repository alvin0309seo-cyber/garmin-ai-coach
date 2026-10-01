const assert = require('node:assert/strict');
const test = require('node:test');
const { getBaseRecommendation } = require('../rule');

test('InBody raw_json adds body-composition guidance without changing recovery intensity', () => {
    const garminData = {
        sleepScore: 80,
        hrvStatus: 'BALANCED',
        restingHeartRate: 55,
        restingHR7dAvg: 54,
        stressLevel: 20,
        gender: '남성',
    };
    const rawJson = {
        gender: '남성',
        weightKg: 80,
        skeletalMuscleKg: 30,
        bodyFatPct: 27,
        segmental: { rightArmKg: 4.5, leftArmKg: 3.4 },
    };

    const recommendation = getBaseRecommendation(garminData, rawJson);

    assert.equal(recommendation.intensity, 'High');
    assert.match(recommendation.guideline, /체성분 참고/);
    assert.match(recommendation.guideline, /좌우 근육 불균형 감지/);
    assert.match(recommendation.guideline, /유산소 비중↑/);
    assert.match(recommendation.guideline, /근비대 위주/);
});
