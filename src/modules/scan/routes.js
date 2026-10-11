/**
 * FamilyConnect Paper Record Digitisation Endpoints — SPEC-011 §6, §10
 *
 * Exposes:
 *  - POST /api/v1/scan/extract — Server-side OCR & structured field extraction
 *  - POST /api/v1/scan/process — Alias for backward/forward compatibility
 */

'use strict';

const express = require('express');
const { writeAuditEvent } = require('../../db');
const { ProblemError } = require('../../middleware/problems');
const { writeLimiter } = require('../../middleware/rateLimit');
const { processScan } = require('./service');

const router = express.Router();

/**
 * Handler for OCR extraction
 */
async function handleExtract(req, res, next) {
    try {
        const { image, formType, rawText, text } = req.body || {};
        const contentText = rawText || text || '';

        if (!image && !contentText) {
            throw new ProblemError(
                'INVALID_SCHEMA',
                'Either "image" or "rawText" is required for extraction.',
                req.originalUrl
            );
        }

        const result = await processScan({
            image,
            formType,
            rawText: contentText
        });

        // Audit event for extraction run
        try {
            await writeAuditEvent(null, {
                actor: req.actor?.actorId || 'CASEWORKER',
                action: 'PAPER_RECORD_EXTRACTED',
                entityType: 'PaperScan',
                entityId: req.body?.localRef || `SCAN-${Date.now()}`,
                newState: {
                    formType: result.formType,
                    confidence: result.overallConfidence,
                    isTabular: result.isTabular,
                    recordCount: result.records?.length || 1
                },
                outcome: 'SUCCESS'
            });
        } catch (_) {
            // Audits are non-blocking
        }

        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
}

router.post('/extract', writeLimiter, handleExtract);
router.post('/process', writeLimiter, handleExtract);

module.exports = router;
