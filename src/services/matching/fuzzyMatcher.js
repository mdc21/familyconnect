/**
 * FamilyConnect Transliteration-Aware Fuzzy Matching Engine — SPEC-011 §6.6
 *
 * Implements:
 * - Cross-script name normalization (Devanagari <-> Latin)
 * - Levenshtein & token-overlap similarity
 * - Age, sex, and location proximity scoring
 * - Guardrail: Confidence >= 85% produces POTENTIAL_MATCH; never silent merge (BR-001)
 */

'use strict';

// Common Devanagari-Latin transliteration mapping
const TRANSLITERATION_MAP = {
    'रमेश': 'ramesh',
    'थापा': 'thapa',
    'सीता': 'sita',
    'राम': 'ram',
    'शर्मा': 'sharma',
    'यादव': 'yadav',
    'तामाङ': 'tamang',
    'गुरुङ': 'gurung',
    'श्रेष्ठ': 'shrestha',
    'राई': 'rai',
    'मगर': 'magar',
    'अधिकारी': 'adhikari',
    'पौडेल': 'poudel',
    'घिमिरे': 'ghimire',
    'खड्का': 'khadka',
    'हरि': 'hari',
    'गीता': 'gita',
    'माया': 'maya',
    'सुनिता': 'sunita',
    'अनिता': 'anita',
    'दिनेश': 'dinesh',
    'राजेश': 'rajesh',
    'विकास': 'bikas',
    'सुरेश': 'suresh',
    'प्रमोद': 'pramod',
    'प्रकाश': 'prakash',
    'विष्णु': 'bishnu',
    'लक्ष्मण': 'laxman'
};

/**
 * Approximate Devanagari to Latin phonetic transliteration
 */
function transliterateDevanagari(text = '') {
    let lower = text.trim();
    for (const [dev, lat] of Object.entries(TRANSLITERATION_MAP)) {
        lower = lower.replaceAll(dev, lat);
    }
    // Basic vowel and consonant replacements for unmapped characters
    return lower
        .replace(/[\u0905-\u0906]/g, 'a')
        .replace(/[\u0907-\u0908]/g, 'i')
        .replace(/[\u0909-\u090A]/g, 'u')
        .replace(/[\u090F-\u0910]/g, 'e')
        .replace(/[\u0913-\u0914]/g, 'o')
        .replace(/\u0915/g, 'k').replace(/\u0916/g, 'kh').replace(/\u0917/g, 'g').replace(/\u0918/g, 'gh')
        .replace(/\u091A/g, 'ch').replace(/\u091B/g, 'chh').replace(/\u091C/g, 'j').replace(/\u091D/g, 'jh')
        .replace(/\u091F/g, 't').replace(/\u0920/g, 'th').replace(/\u0921/g, 'd').replace(/\u0922/g, 'dh')
        .replace(/\u0924/g, 't').replace(/\u0925/g, 'th').replace(/\u0926/g, 'd').replace(/\u0927/g, 'dh')
        .replace(/\u092A/g, 'p').replace(/\u092B/g, 'ph').replace(/\u092C/g, 'b').replace(/\u092D/g, 'bh').replace(/\u092E/g, 'm')
        .replace(/\u092F/g, 'y').replace(/\u0930/g, 'r').replace(/\u0932/g, 'l').replace(/\u0935/g, 'v')
        .replace(/[\u0936\u0937\u0938]/g, 's').replace(/\u0939/g, 'h')
        .replace(/[\u093E-\u094C\u0962-\u0963]/g, '') // strip matras
        .replace(/\u094D/g, ''); // strip halant
}

/**
 * Normalize string for comparison
 */
function normalizeName(name = '') {
    if (!name) return '';
    const clean = transliterateDevanagari(name)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return clean;
}

/**
 * Standard Levenshtein distance
 */
function levenshteinDistance(s1, s2) {
    const m = s1.length;
    const n = s2.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const d = [];
    for (let i = 0; i <= m; i++) d[i] = [i];
    for (let j = 0; j <= n; j++) d[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            d[i][j] = Math.min(
                d[i - 1][j] + 1,      // deletion
                d[i][j - 1] + 1,      // insertion
                d[i - 1][j - 1] + cost // substitution
            );
        }
    }
    return d[m][n];
}

/**
 * Calculates string similarity in range [0, 1]
 */
function stringSimilarity(str1, str2) {
    const s1 = normalizeName(str1);
    const s2 = normalizeName(str2);
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1.0;

    const maxLen = Math.max(s1.length, s2.length);
    const dist = levenshteinDistance(s1, s2);
    const levScore = 1 - (dist / maxLen);

    // Token-based Jaccard similarity (handles swapped first/last names)
    const tokens1 = new Set(s1.split(' ').filter(Boolean));
    const tokens2 = new Set(s2.split(' ').filter(Boolean));
    let intersection = 0;
    for (const t of tokens1) {
        if (tokens2.has(t)) intersection++;
    }
    const union = new Set([...tokens1, ...tokens2]).size;
    const tokenScore = union > 0 ? (intersection / union) : 0;

    return Math.max(levScore, tokenScore);
}

/**
 * Calculates age proximity score
 */
function ageSimilarity(age1, age2) {
    if (age1 == null || age2 == null) return 0.75; // Neutral when unknown
    const a1 = parseInt(age1, 10);
    const a2 = parseInt(age2, 10);
    if (isNaN(a1) || isNaN(a2)) return 0.75;

    const diff = Math.abs(a1 - a2);
    if (diff === 0) return 1.0;
    if (diff <= 2) return 0.9;
    if (diff <= 5) return 0.75;
    if (diff <= 10) return 0.4;
    return 0.1;
}

/**
 * Calculates sex/gender compatibility
 */
function sexSimilarity(sex1, sex2) {
    if (!sex1 || !sex2) return 0.8;
    const s1 = String(sex1).trim().toUpperCase();
    const s2 = String(sex2).trim().toUpperCase();
    if (s1 === s2) return 1.0;
    if (s1.startsWith('M') && s2.startsWith('M')) return 1.0;
    if (s1.startsWith('F') && s2.startsWith('F')) return 1.0;
    if (s1.includes('OTHER') || s2.includes('OTHER') || s1.includes('UNKNOWN') || s2.includes('UNKNOWN')) {
        return 0.7;
    }
    return 0.0; // Clear mismatch (Male vs Female)
}

/**
 * Calculates location similarity
 */
function locationSimilarity(loc1, loc2) {
    if (!loc1 || !loc2) return 0.5; // neutral if unprovided
    const str1 = typeof loc1 === 'object' ? JSON.stringify(loc1) : String(loc1);
    const str2 = typeof loc2 === 'object' ? JSON.stringify(loc2) : String(loc2);
    return stringSimilarity(str1, str2);
}

/**
 * Computes composite match confidence for two person records
 */
function computePersonMatchScore(target, candidate) {
    const nameSim = stringSimilarity(target.name || `${target.firstName || ''} ${target.lastName || ''}`, candidate.name || `${candidate.firstName || ''} ${candidate.lastName || ''}`);
    const ageSim = ageSimilarity(target.age, candidate.age);
    const sexSim = sexSimilarity(target.sex, candidate.sex);
    const locSim = locationSimilarity(target.location, candidate.location);

    // If sex clearly conflicts, cap match score
    if (sexSim === 0.0) {
        return {
            overall: Math.min(nameSim * 0.4, 0.45),
            details: { name: nameSim, age: ageSim, sex: sexSim, location: locSim }
        };
    }

    const overall = (nameSim * 0.55) + (ageSim * 0.20) + (sexSim * 0.15) + (locSim * 0.10);

    return {
        overall: Math.round(overall * 100) / 100,
        details: {
            name: Math.round(nameSim * 100) / 100,
            age: Math.round(ageSim * 100) / 100,
            sex: Math.round(sexSim * 100) / 100,
            location: Math.round(locSim * 100) / 100
        }
    };
}

module.exports = {
    normalizeName,
    levenshteinDistance,
    stringSimilarity,
    ageSimilarity,
    sexSimilarity,
    locationSimilarity,
    computePersonMatchScore
};
