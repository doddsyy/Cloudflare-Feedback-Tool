import { generateDashboardHTML, DashboardData } from './dashboard';

interface Env {
	DB: D1Database;
	AI: any; // Workers AI binding
	AI_SEARCH: any; // AI Search binding
}

interface FeedbackSubmission {
	content: string;
	source: string;
	user_tier: 'Enterprise' | 'Pro' | 'Free';
}

export interface FeedbackRow {
	id: number;
	content: string;
	source: string;
	user_tier: string;
	sentiment_score: number;
	bot_score: number;
	pain_score: number;
	vibe_summary: string | null;
	created_at: number;
}

// Tier weights for pain score calculation
const TIER_WEIGHTS: Record<string, number> = {
	Enterprise: 3,
	Pro: 2,
	Free: 1,
};

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// POST /submit - Priority Signal logic
		if (url.pathname === '/submit' && request.method === 'POST') {
			return handleSubmitFeedback(request, env, ctx);
		}

		// GET /api/search - AI Search endpoint
		if (url.pathname === '/api/search' && request.method === 'GET') {
			return handleSearch(request, env);
		}

		// GET / - Live Pulse logic
		if (url.pathname === '/' && request.method === 'GET') {
			return handleLivePulse(request, env);
		}

		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Priority Signal: Analyze feedback and calculate priority scores
 */
async function handleSubmitFeedback(
	request: Request,
	env: Env,
	ctx: ExecutionContext
): Promise<Response> {
	try {
		const body: FeedbackSubmission = await request.json();

		// Validate required fields
		if (!body.content || !body.source || !body.user_tier) {
			return Response.json(
				{ error: 'Missing required fields: content, source, user_tier' },
				{ status: 400 }
			);
		}

		if (!['Enterprise', 'Pro', 'Free'].includes(body.user_tier)) {
			return Response.json(
				{ error: 'user_tier must be Enterprise, Pro, or Free' },
				{ status: 400 }
			);
		}

		// Analyze sentiment using Workers AI
		const sentimentResult = await analyzeSentiment(body.content, env);
		const sentimentScore = sentimentResult.score; // 1-5 scale

		// Analyze bot probability using Workers AI
		const botResult = await analyzeBotProbability(body.content, env);
		const botScore = botResult.score; // 0-1 scale

		// Calculate pain score: (6 - sentiment) * TierWeight
		const tierWeight = TIER_WEIGHTS[body.user_tier];
		const painScore = (6 - sentimentScore) * tierWeight;

		// Save to database
		const result = await env.DB.prepare(
			`INSERT INTO feedback (content, source, user_tier, sentiment_score, bot_score, pain_score, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(
				body.content,
				body.source,
				body.user_tier,
				sentimentScore,
				botScore,
				painScore,
				Math.floor(Date.now() / 1000)
			)
			.run();

		const feedbackId = result.meta.last_row_id;

		// Index in AI Search for semantic search
		ctx.waitUntil(
			indexFeedbackInAISearch(feedbackId, body.content, body.source, body.user_tier, env)
		);

		return Response.json({
			id: feedbackId,
			sentiment_score: sentimentScore,
			bot_score: botScore,
			pain_score: painScore,
			status: 'submitted',
		});
	} catch (error) {
		console.error('Error submitting feedback:', error);
		return Response.json(
			{ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

/**
 * Index feedback in AI Search for semantic search
 */
async function indexFeedbackInAISearch(
	id: number,
	content: string,
	source: string,
	tier: string,
	env: Env
): Promise<void> {
	try {
		await env.AI_SEARCH.upsert({
			id: id.toString(),
			text: content,
			metadata: {
				source,
				tier,
				feedback_id: id,
			},
		});
	} catch (error) {
		console.error('Error indexing feedback in AI Search:', error);
		// Don't fail the request if indexing fails
	}
}

/**
 * Handle semantic search using AI Search
 */
async function handleSearch(request: Request, env: Env): Promise<Response> {
	try {
		const url = new URL(request.url);
		const query = url.searchParams.get('q');

		if (!query || query.trim().length === 0) {
			return Response.json({ error: 'Query parameter "q" is required' }, { status: 400 });
		}

		// Perform semantic search
		const searchResults = await env.AI_SEARCH.query({
			query: query,
			limit: 10,
		});

		// Get full feedback details from D1 for the matched IDs
		const resultIds = searchResults.matches.map((m: any) => parseInt(m.id));
		
		if (resultIds.length === 0) {
			return Response.json({ results: [], query });
		}

		const placeholders = resultIds.map(() => '?').join(',');
		const feedbackDetails = await env.DB.prepare(
			`SELECT * FROM feedback WHERE id IN (${placeholders}) ORDER BY created_at DESC`
		)
			.bind(...resultIds)
			.all<FeedbackRow>();

		// Combine search scores with feedback data
		const results = feedbackDetails.results.map((feedback) => {
			const match = searchResults.matches.find((m: any) => parseInt(m.id) === feedback.id);
			return {
				...feedback,
				similarity_score: match?.score || 0,
			};
		});

		return Response.json({
			results,
			query,
			total: results.length,
		});
	} catch (error) {
		console.error('Error performing search:', error);
		return Response.json(
			{ error: 'Search failed', message: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

/**
 * Analyze sentiment and return a score from 1-5
 * 1 = very negative, 5 = very positive
 */
async function analyzeSentiment(content: string, env: Env): Promise<{ score: number }> {
	try {
		// Use Workers AI sentiment analysis model
		const response = await env.AI.run('@cf/huggingface/distilbert-sst-2-int8', {
			text: content,
		});

		// Log response for debugging
		console.log('Sentiment response:', JSON.stringify(response));

		// Handle different response structures
		let label: string;
		let confidence: number;

		// Check if response is an array
		if (Array.isArray(response) && response.length > 0) {
			label = response[0].label || 'NEGATIVE';
			confidence = response[0].score || 0.5;
		} 
		// Check if response has a direct structure
		else if (response && typeof response === 'object') {
			label = (response as any).label || (response as any)[0]?.label || 'NEGATIVE';
			confidence = (response as any).score || (response as any)[0]?.score || 0.5;
		} 
		// Fallback
		else {
			console.warn('Unexpected sentiment response format:', response);
			label = 'NEGATIVE';
			confidence = 0.5;
		}

		// Normalize label to uppercase
		label = label.toUpperCase();

		// Convert to 1-5 scale
		// If positive, map confidence to 3-5 range
		// If negative, map confidence to 1-3 range
		let score: number;
		if (label === 'POSITIVE' || label.includes('POSITIVE')) {
			score = Math.round(3 + confidence * 2); // 3-5 range
		} else {
			score = Math.round(3 - confidence * 2); // 1-3 range
		}

		// Clamp to 1-5
		score = Math.max(1, Math.min(5, score));

		console.log(`Sentiment: label=${label}, confidence=${confidence}, score=${score}`);
		return { score };
	} catch (error) {
		console.error('Sentiment analysis error:', error);
		console.error('Error details:', error instanceof Error ? error.stack : String(error));
		// Default to neutral on error
		return { score: 3 };
	}
}

/**
 * Analyze bot probability and return a score from 0-1
 * 0 = definitely human, 1 = definitely bot
 */
async function analyzeBotProbability(content: string, env: Env): Promise<{ score: number }> {
	try {
		// Use Workers AI to analyze if content seems bot-like
		const prompt = `Analyze this text and determine if it was likely written by a bot or automated system. 
Return only a JSON object with a "bot_probability" field (0.0 to 1.0, where 0.0 is definitely human and 1.0 is definitely bot):
"${content}"`;

		const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
			messages: [
				{
					role: 'system',
					content: 'You are a bot detection system. Analyze text and return ONLY valid JSON with bot_probability (0.0-1.0). Example: {"bot_probability": 0.2}',
				},
				{
					role: 'user',
					content: prompt,
				},
			],
			max_tokens: 50,
		});

		// Log response for debugging
		console.log('Bot detection response:', JSON.stringify(response));

		// Try to parse JSON from response
		const responseText = response?.response || response?.text || JSON.stringify(response) || '{}';
		console.log('Bot detection response text:', responseText);

		// Try multiple JSON extraction methods
		let parsed: any = null;
		
		// Method 1: Direct JSON parse
		try {
			parsed = JSON.parse(responseText);
		} catch (e) {
			// Method 2: Extract JSON from text
			const jsonMatch = responseText.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				try {
					parsed = JSON.parse(jsonMatch[0]);
				} catch (e2) {
					console.warn('Failed to parse JSON from match:', jsonMatch[0]);
				}
			}
		}

		if (parsed && typeof parsed.bot_probability === 'number') {
			const botScore = Math.max(0, Math.min(1, parsed.bot_probability));
			console.log(`Bot probability from AI: ${botScore}`);
			return { score: botScore };
		}

		// Fallback: simple heuristic based on content length and patterns
		console.log('Using fallback bot detection heuristic');
		const botIndicators = [
			content.length < 20,
			!!content.match(/^[A-Z\s]+$/), // ALL CAPS
			content.split(' ').length < 5, // Very short
			content.includes('http://') || content.includes('https://'), // URLs
			content.match(/[0-9]{10,}/), // Long number sequences
		];

		const trueCount = botIndicators.filter(Boolean).length;
		const botScore = trueCount / botIndicators.length;
		console.log(`Bot probability from heuristic: ${botScore} (${trueCount}/${botIndicators.length} indicators)`);
		return { score: botScore };
	} catch (error) {
		console.error('Bot analysis error:', error);
		console.error('Error details:', error instanceof Error ? error.stack : String(error));
		// Default to 0.3 (likely human) on error
		return { score: 0.3 };
	}
}

/**
 * Live Pulse: Display real-time feedback dashboard
 */
async function handleLivePulse(request: Request, env: Env): Promise<Response> {
	try {
		const url = new URL(request.url);
		const timePeriod = url.searchParams.get('period') || 'day';

		// Calculate time range based on period
		const now = Math.floor(Date.now() / 1000);
		let timeAgo: number;
		switch (timePeriod) {
			case 'day':
				timeAgo = now - 86400; // 24 hours
				break;
			case 'week':
				timeAgo = now - 604800; // 7 days
				break;
			case 'month':
				timeAgo = now - 2592000; // 30 days
				break;
			case 'year':
				timeAgo = now - 31536000; // 365 days
				break;
			default:
				timeAgo = now - 86400;
		}

		// Get all feedback for the time period
		const allFeedback = await env.DB.prepare(
			`SELECT * FROM feedback 
			 WHERE created_at >= ? 
			 ORDER BY created_at DESC`
		)
			.bind(timeAgo)
			.all<FeedbackRow>();

		// Calculate metrics
		const avgSentiment =
			allFeedback.results.length > 0
				? allFeedback.results.reduce((sum, f) => sum + f.sentiment_score, 0) /
				  allFeedback.results.length
				: 3;

		const avgBotScore =
			allFeedback.results.length > 0
				? allFeedback.results.reduce((sum, f) => sum + f.bot_score, 0) /
				  allFeedback.results.length
				: 0;

		const avgPainScore =
			allFeedback.results.length > 0
				? allFeedback.results.reduce((sum, f) => sum + f.pain_score, 0) /
				  allFeedback.results.length
				: 0;

		// Group by sentiment
		const sentimentCounts = {
			1: allFeedback.results.filter((f) => f.sentiment_score === 1).length,
			2: allFeedback.results.filter((f) => f.sentiment_score === 2).length,
			3: allFeedback.results.filter((f) => f.sentiment_score === 3).length,
			4: allFeedback.results.filter((f) => f.sentiment_score === 4).length,
			5: allFeedback.results.filter((f) => f.sentiment_score === 5).length,
		};

		// Group by source
		const sourceCounts: Record<string, number> = {};
		allFeedback.results.forEach((f) => {
			sourceCounts[f.source] = (sourceCounts[f.source] || 0) + 1;
		});

		// Group by tier
		const tierCounts: Record<string, number> = {};
		allFeedback.results.forEach((f) => {
			tierCounts[f.user_tier] = (tierCounts[f.user_tier] || 0) + 1;
		});

		// Get recent feedback for AI analysis (last 20)
		const recentForAI = allFeedback.results.slice(0, 20);

		// Generate AI insights and recommendations
		const insights = await generateInsights(recentForAI, env);
		const recommendations = await generateRecommendations(recentForAI, env);

		// Extract themes for feedback that don't have them
		const feedbackWithThemes = await Promise.all(
			allFeedback.results.map(async (f) => {
				if (!f.vibe_summary) {
					const theme = await extractTheme(f.content, env);
					return { ...f, theme };
				}
				return { ...f, theme: f.vibe_summary };
			})
		);

		// Generate HTML page
		const html = generateDashboardHTML({
			feedback: feedbackWithThemes,
			avgSentiment,
			avgBotScore,
			avgPainScore,
			sentimentCounts,
			sourceCounts,
			tierCounts,
			insights,
			recommendations,
			timePeriod,
			totalFeedback: allFeedback.results.length,
		});

		return new Response(html, {
			headers: {
				'Content-Type': 'text/html;charset=UTF-8',
			},
		});
	} catch (error) {
		console.error('Error generating live pulse:', error);
		return new Response(
			`<html><body><h1>Error</h1><p>${error instanceof Error ? error.message : 'Unknown error'}</p></body></html>`,
			{
				status: 500,
				headers: { 'Content-Type': 'text/html' },
			}
		);
	}
}

/**
 * Generate 3 key insights from feedback
 */
async function generateInsights(feedback: FeedbackRow[], env: Env): Promise<string[]> {
	if (feedback.length === 0) {
		return ['No feedback available yet', 'Waiting for submissions', 'Check back soon'];
	}

	try {
		const feedbackTexts = feedback
			.map((f, i) => `${i + 1}. [${f.source}] ${f.content.substring(0, 100)}`)
			.join('\n');

		const prompt = `Analyze these feedback entries and extract exactly 3 key insights. Return ONLY a JSON array of exactly 3 insight strings, no other text:
${feedbackTexts}`;

		const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
			messages: [
				{
					role: 'system',
					content: 'You are a product manager. Extract exactly 3 key insights as a JSON array of strings. Return only the JSON array, nothing else.',
				},
				{
					role: 'user',
					content: prompt,
				},
			],
			max_tokens: 300,
		});

		const responseText = response.response || '[]';
		const jsonMatch = responseText.match(/\[[\s\S]*\]/);
		if (jsonMatch) {
			const insights = JSON.parse(jsonMatch[0]);
			return Array.isArray(insights) && insights.length >= 3
				? insights.slice(0, 3)
				: ['Analyzing feedback patterns...', 'Identifying key themes...', 'Reviewing customer sentiment...'];
		}

		// Fallback
		return ['Analyzing feedback patterns...', 'Identifying key themes...', 'Reviewing customer sentiment...'];
	} catch (error) {
		console.error('Error generating insights:', error);
		return ['Analysis in progress...', 'Processing feedback...', 'Generating insights...'];
	}
}

/**
 * Generate 2 recommended next steps
 */
async function generateRecommendations(feedback: FeedbackRow[], env: Env): Promise<string[]> {
	if (feedback.length === 0) {
		return ['Start collecting feedback', 'Set up feedback channels'];
	}

	try {
		const highPainFeedback = feedback.filter((f) => f.pain_score >= 6);
		const feedbackTexts = highPainFeedback
			.map((f, i) => `${i + 1}. [${f.source}] ${f.content.substring(0, 100)}`)
			.join('\n');

		if (feedbackTexts.length === 0) {
			return ['Continue monitoring feedback', 'Maintain current product quality'];
		}

		const prompt = `Based on these high-priority feedback entries, suggest exactly 2 actionable next steps for the product team. Return ONLY a JSON array of exactly 2 recommendation strings:
${feedbackTexts}`;

		const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
			messages: [
				{
					role: 'system',
					content: 'You are a product manager. Suggest exactly 2 actionable next steps as a JSON array of strings. Return only the JSON array.',
				},
				{
					role: 'user',
					content: prompt,
				},
			],
			max_tokens: 200,
		});

		const responseText = response.response || '[]';
		const jsonMatch = responseText.match(/\[[\s\S]*\]/);
		if (jsonMatch) {
			const recommendations = JSON.parse(jsonMatch[0]);
			return Array.isArray(recommendations) && recommendations.length >= 2
				? recommendations.slice(0, 2)
				: ['Review high-priority feedback', 'Plan next sprint items'];
		}

		return ['Review high-priority feedback', 'Plan next sprint items'];
	} catch (error) {
		console.error('Error generating recommendations:', error);
		return ['Review high-priority feedback', 'Plan next sprint items'];
	}
}

/**
 * Extract theme from feedback content
 */
async function extractTheme(content: string, env: Env): Promise<string> {
	try {
		const prompt = `Extract the main theme or topic from this feedback in 2-4 words: "${content}"`;

		const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
			messages: [
				{
					role: 'system',
					content: 'Extract the main theme in 2-4 words. Return only the theme, nothing else.',
				},
				{
					role: 'user',
					content: prompt,
				},
			],
			max_tokens: 20,
		});

		return response.response?.trim() || 'General Feedback';
	} catch (error) {
		console.error('Error extracting theme:', error);
		return 'General Feedback';
	}
}
