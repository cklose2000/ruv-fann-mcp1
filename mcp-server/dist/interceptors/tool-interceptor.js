import winston from "winston";
const logger = winston.createLogger({
    level: "debug",
    format: winston.format.simple(),
    transports: [new winston.transports.Console()],
});
export class ToolInterceptor {
    predictor;
    learner;
    recentExecutions = [];
    maxHistorySize = 100;
    constructor(predictor, learner) {
        this.predictor = predictor;
        this.learner = learner;
    }
    async interceptToolRequest(tool, params, context = {}) {
        logger.debug(`Intercepting tool request: ${tool}`, { params });
        // Add recent executions to context
        const enrichedContext = {
            ...context,
            recentTools: this.recentExecutions.slice(-10),
        };
        // Get prediction from pattern predictor
        const prediction = await this.predictor.predict(tool, params, enrichedContext);
        // Log prediction for analysis
        logger.info(`Prediction for ${tool}:`, {
            successProbability: prediction.successProbability,
            confidence: prediction.confidence,
            warnings: prediction.warnings,
        });
        // If high risk of failure, enhance the response
        if (prediction.successProbability < 0.3 && prediction.confidence > 0.7) {
            prediction.warnings = prediction.warnings || [];
            prediction.warnings.push({
                level: "high",
                message: `This command has a ${Math.round((1 - prediction.successProbability) * 100)}% chance of failure based on past patterns`,
                suggestion: prediction.suggestions?.[0],
            });
        }
        return prediction;
    }
    async recordOutcome(tool, params, outcome, duration, error) {
        const execution = {
            tool,
            params,
            timestamp: new Date(),
            outcome,
            duration,
            error,
        };
        // Add to recent history
        this.recentExecutions.push(execution);
        if (this.recentExecutions.length > this.maxHistorySize) {
            this.recentExecutions.shift();
        }
        // Record in pattern learner
        await this.learner.recordExecution(execution);
        // Log outcome
        logger.info(`Recorded outcome for ${tool}: ${outcome}`, {
            duration,
            error,
        });
    }
    async analyzeSequence(tools) {
        // Analyze common sequences
        const sequences = this.findCommonSequences(tools);
        // Predict likely next tools
        const predictions = await this.predictor.predictNextTool(tools);
        return {
            commonSequences: sequences,
            likelyNext: predictions,
            riskAnalysis: await this.analyzeSequenceRisks(tools),
        };
    }
    findCommonSequences(tools) {
        const sequences = new Map();
        // Look for patterns in recent executions
        for (let i = 0; i < this.recentExecutions.length - tools.length; i++) {
            const sequence = this.recentExecutions
                .slice(i, i + tools.length)
                .map(e => e.tool)
                .join(" -> ");
            sequences.set(sequence, (sequences.get(sequence) || 0) + 1);
        }
        // Sort by frequency
        return Array.from(sequences.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([sequence, count]) => ({ sequence, count }));
    }
    async analyzeSequenceRisks(tools) {
        const risks = [];
        // Check for known risky patterns
        if (tools.includes("git push") && !tools.includes("git pull")) {
            risks.push({
                level: "medium",
                pattern: "Push without pull",
                suggestion: "Consider pulling latest changes first",
            });
        }
        if (tools.includes("bq query") && !tools.includes("bq show")) {
            risks.push({
                level: "low",
                pattern: "Query without schema check",
                suggestion: "Verify table schema before querying",
            });
        }
        return risks;
    }
    getRecentHistory() {
        return [...this.recentExecutions];
    }
    clearHistory() {
        this.recentExecutions = [];
    }
}
//# sourceMappingURL=tool-interceptor.js.map