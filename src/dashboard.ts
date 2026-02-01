import { FeedbackRow } from './index';

export interface DashboardData {
	feedback: Array<FeedbackRow & { theme?: string }>;
	avgSentiment: number;
	avgBotScore: number;
	avgPainScore: number;
	sentimentCounts: Record<number, number>;
	sourceCounts: Record<string, number>;
	tierCounts: Record<string, number>;
	insights: string[];
	recommendations: string[];
	timePeriod: string;
	totalFeedback: number;
}

// Helper functions
function formatDate(timestamp: number): string {
	return new Date(timestamp * 1000).toLocaleString();
}

function getSentimentEmoji(score: number): string {
	if (score >= 4.5) return '😊';
	if (score >= 3.5) return '🙂';
	if (score >= 2.5) return '😐';
	if (score >= 1.5) return '😕';
	return '😞';
}

function getTierColor(tier: string): string {
	switch (tier) {
		case 'Enterprise':
			return '#8B5CF6';
		case 'Pro':
			return '#3B82F6';
		case 'Free':
			return '#6B7280';
		default:
			return '#000';
	}
}

function getUrgencyColor(urgency: string): string {
	switch (urgency) {
		case 'Critical':
			return '#DC2626';
		case 'High':
			return '#F59E0B';
		case 'Medium':
			return '#3B82F6';
		case 'Low':
			return '#10B981';
		default:
			return '#6B7280';
	}
}

function calculateUrgency(sentiment: number, painScore: number): string {
	const urgencyScore = (6 - sentiment) * 0.4 + painScore * 0.1;
	if (urgencyScore >= 8) return 'Critical';
	if (urgencyScore >= 5) return 'High';
	if (urgencyScore >= 3) return 'Medium';
	return 'Low';
}

export function generateDashboardHTML(data: DashboardData): string {
	const {
		feedback,
		avgSentiment,
		avgBotScore,
		avgPainScore,
		sentimentCounts,
		sourceCounts,
		tierCounts,
		insights,
		recommendations,
		timePeriod,
		totalFeedback,
	} = data;

	// Calculate speedometer angle (0-180 degrees for half circle)
	const speedometerAngle = ((avgSentiment - 1) / 4) * 180;

	// Get unique sources and tiers for filters
	const uniqueSources = [...new Set(feedback.map((f) => f.source))];
	const uniqueTiers = [...new Set(feedback.map((f) => f.user_tier))];
	const uniqueUrgencies = ['Critical', 'High', 'Medium', 'Low'];

	const periodLabel = timePeriod.charAt(0).toUpperCase() + timePeriod.slice(1);

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Live Pulse - Feedback Dashboard</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			background: #f3f4f6;
			min-height: 100vh;
			padding: 20px;
		}
		.container {
			max-width: 1400px;
			margin: 0 auto;
		}
		.header {
			background: white;
			padding: 30px;
			border-radius: 12px;
			margin-bottom: 20px;
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		}
		.header h1 {
			font-size: 32px;
			margin-bottom: 5px;
			color: #1a1a1a;
		}
		.container-1 {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 20px;
			margin-bottom: 20px;
		}
		.container-1-1 {
			background: white;
			padding: 18px;
			border-radius: 12px;
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		}
		.container-1-2 {
			background: white;
			padding: 20px;
			border-radius: 12px;
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		}
		.speedometer-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 12px;
		}
		.speedometer-header h2 {
			font-size: 18px;
			color: #1a1a1a;
		}
		.period-select {
			padding: 6px 10px;
			border: 1px solid #d1d5db;
			border-radius: 6px;
			font-size: 13px;
			background: white;
			cursor: pointer;
		}
		.speedometer-container {
			position: relative;
			display: flex;
			justify-content: center;
			align-items: center;
			margin: 10px 0;
		}
		.speedometer {
			width: 100%;
			max-width: 250px;
			height: auto;
		}
		.speedometer-value {
			position: absolute;
			bottom: 15px;
			text-align: center;
		}
		.sentiment-display {
			font-size: 24px;
			font-weight: bold;
			color: #1a1a1a;
		}
		.sentiment-emoji {
			font-size: 32px;
			margin-top: 3px;
		}
		.insights-section {
			margin-top: 15px;
		}
		.insights-section h3 {
			font-size: 14px;
			color: #374151;
			margin-bottom: 8px;
		}
		.insights-list, .recommendations-list {
			list-style: none;
			padding: 0;
		}
		.insights-list li, .recommendations-list li {
			padding: 4px 0;
			padding-left: 18px;
			position: relative;
			color: #4b5563;
			line-height: 1.4;
			font-size: 13px;
		}
		.insights-list li:before {
			content: "•";
			position: absolute;
			left: 0;
			color: #3b82f6;
			font-weight: bold;
		}
		.recommendations-list li:before {
			content: "→";
			position: absolute;
			left: 0;
			color: #10b981;
		}
		.container-1-2 h2 {
			font-size: 20px;
			color: #1a1a1a;
			margin-bottom: 20px;
		}
		.metrics-grid {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 15px;
			margin-bottom: 25px;
		}
		.metric-card {
			background: #f9fafb;
			padding: 15px;
			border-radius: 8px;
		}
		.metric-card h4 {
			font-size: 12px;
			color: #6b7280;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			margin-bottom: 8px;
		}
		.metric-value {
			font-size: 24px;
			font-weight: bold;
			color: #1a1a1a;
		}
		.breakdown-section {
			display: flex;
			flex-direction: column;
			gap: 12px;
		}
		.breakdown-cards-row {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 12px;
		}
		.breakdown-card {
			background: #f9fafb;
			padding: 12px;
			border-radius: 8px;
		}
		.breakdown-card h4 {
			font-size: 13px;
			color: #374151;
			margin-bottom: 10px;
		}
		.breakdown-bars {
			display: flex;
			flex-direction: column;
			gap: 8px;
		}
		.bar-item {
			display: flex;
			align-items: center;
			gap: 10px;
			font-size: 12px;
		}
		.bar {
			flex: 1;
			height: 20px;
			background: #e5e7eb;
			border-radius: 4px;
			overflow: hidden;
		}
		.bar-fill {
			height: 100%;
			transition: width 0.3s ease;
		}
		.source-list, .tier-list {
			display: flex;
			flex-direction: column;
			gap: 6px;
		}
		.source-item, .tier-item {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 6px 8px;
			background: white;
			border-radius: 6px;
			font-size: 12px;
		}
		.source-count, .tier-count {
			font-weight: 600;
			color: #1a1a1a;
		}
		.tier-badge-small {
			padding: 4px 8px;
			border-radius: 4px;
			font-size: 11px;
			font-weight: 600;
		}
		.container-2 {
			background: white;
			padding: 25px;
			border-radius: 12px;
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		}
		.search-section {
			margin-bottom: 20px;
		}
		.search-container {
			display: flex;
			gap: 10px;
			margin-bottom: 15px;
		}
		.search-input {
			flex: 1;
			padding: 10px 15px;
			border: 1px solid #d1d5db;
			border-radius: 6px;
			font-size: 14px;
		}
		.search-btn {
			padding: 10px 20px;
			background: #3b82f6;
			color: white;
			border: none;
			border-radius: 6px;
			font-size: 14px;
			font-weight: 600;
			cursor: pointer;
			transition: background 0.2s;
		}
		.search-btn:hover {
			background: #2563eb;
		}
		.search-results {
			display: none;
			background: #f9fafb;
			padding: 15px;
			border-radius: 8px;
			margin-top: 15px;
		}
		.search-results.active {
			display: block;
		}
		.search-result-item {
			background: white;
			padding: 12px;
			border-radius: 6px;
			margin-bottom: 10px;
			border-left: 3px solid #3b82f6;
		}
		.search-result-item h4 {
			font-size: 14px;
			color: #1a1a1a;
			margin-bottom: 5px;
		}
		.search-result-item .similarity {
			font-size: 12px;
			color: #6b7280;
			margin-bottom: 8px;
		}
		.search-result-item .content {
			font-size: 13px;
			color: #4b5563;
		}
		.table-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 20px;
		}
		.table-header h2 {
			font-size: 20px;
			color: #1a1a1a;
		}
		.table-controls {
			display: flex;
			gap: 10px;
			align-items: center;
		}
		.filters {
			display: flex;
			gap: 10px;
		}
		.filter-select {
			padding: 6px 10px;
			border: 1px solid #d1d5db;
			border-radius: 6px;
			font-size: 13px;
			background: white;
			cursor: pointer;
		}
		.expand-btn {
			padding: 8px 16px;
			background: #3b82f6;
			color: white;
			border: none;
			border-radius: 6px;
			font-size: 13px;
			font-weight: 600;
			cursor: pointer;
			transition: background 0.2s;
		}
		.expand-btn:hover {
			background: #2563eb;
		}
		.table-container {
			max-height: 500px;
			overflow-y: auto;
			transition: max-height 0.3s ease;
		}
		.table-container.expanded {
			max-height: 1200px;
		}
		table {
			width: 100%;
			border-collapse: collapse;
		}
		th {
			text-align: left;
			padding: 12px;
			border-bottom: 2px solid #e5e7eb;
			font-weight: 600;
			color: #374151;
			font-size: 13px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			position: sticky;
			top: 0;
			background: white;
			z-index: 10;
		}
		td {
			padding: 12px;
			border-bottom: 1px solid #e5e7eb;
			font-size: 13px;
			color: #1f2937;
		}
		tr:hover {
			background: #f9fafb;
		}
		.badge {
			display: inline-block;
			padding: 4px 8px;
			border-radius: 4px;
			font-size: 11px;
			font-weight: 600;
		}
		.tier-badge {
			background: #e0e7ff;
			color: #3730a3;
		}
		.sentiment-badge {
			background: #fef3c7;
			color: #92400e;
		}
		.pain-badge {
			background: #fee2e2;
			color: #991b1b;
		}
		.urgency-badge {
			font-size: 11px;
		}
		.content-cell {
			max-width: 250px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.empty-state {
			text-align: center;
			padding: 40px;
			color: #6b7280;
		}
		@media (max-width: 1200px) {
			.container-1 {
				grid-template-columns: 1fr;
			}
		}
	</style>
</head>
<body>
	<div class="container">
		<!-- Title Container -->
		<div class="header">
			<h1>📊 Feedback Analytics Dashboard</h1>
			<p style="color: #6b7280; margin-top: 5px;">Product feedback aggregation and analysis</p>
		</div>

		<!-- Container 1: Split into 1.1 (Speedometer + Insights) and 1.2 (Data Metrics) -->
		<div class="container-1">
			<!-- Container 1.1: Speedometer + Insights -->
			<div class="container-1-1">
				<div class="speedometer-header">
					<h2>Average Sentiment</h2>
					<select id="timePeriod" class="period-select" onchange="changePeriod()">
						<option value="day" ${timePeriod === 'day' ? 'selected' : ''}>Past Day</option>
						<option value="week" ${timePeriod === 'week' ? 'selected' : ''}>Past Week</option>
						<option value="month" ${timePeriod === 'month' ? 'selected' : ''}>Past Month</option>
						<option value="year" ${timePeriod === 'year' ? 'selected' : ''}>Past Year</option>
					</select>
				</div>
				<div class="speedometer-container">
					<svg class="speedometer" viewBox="0 0 200 120">
						<!-- Background arc -->
						<path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e5e7eb" stroke-width="12" />
						<!-- Colored segments -->
						<path d="M 20 100 A 80 80 0 0 1 60 40" fill="none" stroke="#ef4444" stroke-width="12" />
						<path d="M 60 40 A 80 80 0 0 1 100 30" fill="none" stroke="#f59e0b" stroke-width="12" />
						<path d="M 100 30 A 80 80 0 0 1 140 40" fill="none" stroke="#eab308" stroke-width="12" />
						<path d="M 140 40 A 80 80 0 0 1 180 100" fill="none" stroke="#10b981" stroke-width="12" />
						<!-- Needle -->
						<line x1="100" y1="100" x2="${100 + 80 * Math.cos((180 - speedometerAngle) * Math.PI / 180)}" y2="${100 - 80 * Math.sin((180 - speedometerAngle) * Math.PI / 180)}" stroke="#1f2937" stroke-width="3" stroke-linecap="round" />
						<!-- Center dot -->
						<circle cx="100" cy="100" r="5" fill="#1f2937" />
					</svg>
					<div class="speedometer-value">
						<div class="sentiment-display">${avgSentiment.toFixed(1)}/5</div>
						<div class="sentiment-emoji">${getSentimentEmoji(avgSentiment)}</div>
					</div>
				</div>
				<div class="insights-section">
					<h3>Key Insights</h3>
					<ul class="insights-list">
						${insights.map(insight => `<li>${insight}</li>`).join('')}
					</ul>
					<h3 style="margin-top: 20px;">Recommended Next Steps</h3>
					<ul class="recommendations-list">
						${recommendations.map(rec => `<li>${rec}</li>`).join('')}
					</ul>
				</div>
			</div>

			<!-- Container 1.2: Data Metrics -->
			<div class="container-1-2">
				<h2>Data Analysis</h2>
				<div class="metrics-grid">
					<div class="metric-card">
						<h4>Total Feedback</h4>
						<div class="metric-value">${totalFeedback}</div>
					</div>
					<div class="metric-card">
						<h4>Avg Bot Probability</h4>
						<div class="metric-value">${(avgBotScore * 100).toFixed(1)}%</div>
					</div>
					<div class="metric-card">
						<h4>Avg Pain Score</h4>
						<div class="metric-value">${avgPainScore.toFixed(1)}</div>
					</div>
					<div class="metric-card">
						<h4>High Pain Items</h4>
						<div class="metric-value">${feedback.filter(f => f.pain_score >= 6).length}</div>
					</div>
				</div>
				<div class="breakdown-section">
					<div class="breakdown-card">
						<h4>Sentiment Distribution</h4>
						<div class="breakdown-bars">
							<div class="bar-item"><span>1 😞</span><div class="bar"><div class="bar-fill" style="width: ${totalFeedback > 0 ? (sentimentCounts[1] / totalFeedback * 100) : 0}%; background: #ef4444;"></div></div><span>${sentimentCounts[1]}</span></div>
							<div class="bar-item"><span>2 😕</span><div class="bar"><div class="bar-fill" style="width: ${totalFeedback > 0 ? (sentimentCounts[2] / totalFeedback * 100) : 0}%; background: #f59e0b;"></div></div><span>${sentimentCounts[2]}</span></div>
							<div class="bar-item"><span>3 😐</span><div class="bar"><div class="bar-fill" style="width: ${totalFeedback > 0 ? (sentimentCounts[3] / totalFeedback * 100) : 0}%; background: #eab308;"></div></div><span>${sentimentCounts[3]}</span></div>
							<div class="bar-item"><span>4 🙂</span><div class="bar"><div class="bar-fill" style="width: ${totalFeedback > 0 ? (sentimentCounts[4] / totalFeedback * 100) : 0}%; background: #84cc16;"></div></div><span>${sentimentCounts[4]}</span></div>
							<div class="bar-item"><span>5 😊</span><div class="bar"><div class="bar-fill" style="width: ${totalFeedback > 0 ? (sentimentCounts[5] / totalFeedback * 100) : 0}%; background: #10b981;"></div></div><span>${sentimentCounts[5]}</span></div>
						</div>
					</div>
					<div class="breakdown-cards-row">
						<div class="breakdown-card">
							<h4>By Source</h4>
							<div class="source-list">
								${Object.entries(sourceCounts).map(([source, count]) => `
									<div class="source-item">
										<span>${source}</span>
										<span class="source-count">${count}</span>
									</div>
								`).join('')}
							</div>
						</div>
						<div class="breakdown-card">
							<h4>By Tier</h4>
							<div class="tier-list">
								${Object.entries(tierCounts).map(([tier, count]) => `
									<div class="tier-item">
										<span class="tier-badge-small" style="background: ${getTierColor(tier)}20; color: ${getTierColor(tier)}">${tier}</span>
										<span class="tier-count">${count}</span>
									</div>
								`).join('')}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Container 2: Feedback Table with Filters -->
		<div class="container-2">
			<!-- Search Section -->
			<div class="search-section">
				<div class="search-container">
					<input 
						type="text" 
						id="searchInput" 
						class="search-input" 
						placeholder="Search for similar feedback or themes..."
						onkeypress="if(event.key === 'Enter') performSearch()"
					/>
					<button class="search-btn" onclick="performSearch()">🔍 Search</button>
				</div>
				<div id="searchResults" class="search-results"></div>
			</div>
			
			<div class="table-header">
				<h2>Recent Feedback</h2>
				<div class="table-controls">
					<div class="filters">
						<select id="filterSource" class="filter-select" onchange="filterTable()">
							<option value="">All Sources</option>
							${uniqueSources.map(s => `<option value="${s}">${s}</option>`).join('')}
						</select>
						<select id="filterTier" class="filter-select" onchange="filterTable()">
							<option value="">All Tiers</option>
							${uniqueTiers.map(t => `<option value="${t}">${t}</option>`).join('')}
						</select>
						<select id="filterUrgency" class="filter-select" onchange="filterTable()">
							<option value="">All Urgencies</option>
							${uniqueUrgencies.map(u => `<option value="${u}">${u}</option>`).join('')}
						</select>
					</div>
					<button class="expand-btn" onclick="toggleExpand()">Expand</button>
				</div>
			</div>
			<div class="table-container" id="tableContainer">
				${feedback.length === 0 ? '<div class="empty-state">No feedback available</div>' : `
				<table id="feedbackTable">
					<thead>
						<tr>
							<th>Time</th>
							<th>Source</th>
							<th>Tier</th>
							<th>Content</th>
							<th>Theme</th>
							<th>Sentiment</th>
							<th>Urgency</th>
							<th>Pain Score</th>
							<th>Bot Score</th>
						</tr>
					</thead>
					<tbody>
						${feedback.map((f) => {
							const urgency = calculateUrgency(f.sentiment_score, f.pain_score);
							return `
						<tr data-source="${f.source}" data-tier="${f.user_tier}" data-urgency="${urgency}">
							<td>${formatDate(f.created_at)}</td>
							<td>${f.source}</td>
							<td><span class="badge tier-badge" style="background: ${getTierColor(f.user_tier)}20; color: ${getTierColor(f.user_tier)}">${f.user_tier}</span></td>
							<td class="content-cell" title="${f.content.replace(/"/g, '&quot;')}">${f.content.substring(0, 60)}${f.content.length > 60 ? '...' : ''}</td>
							<td>${f.theme || 'General'}</td>
							<td><span class="badge sentiment-badge">${f.sentiment_score}/5 ${getSentimentEmoji(f.sentiment_score)}</span></td>
							<td><span class="badge urgency-badge" style="background: ${getUrgencyColor(urgency)}20; color: ${getUrgencyColor(urgency)}">${urgency}</span></td>
							<td><span class="badge pain-badge">${f.pain_score.toFixed(1)}</span></td>
							<td>${(f.bot_score * 100).toFixed(0)}%</td>
						</tr>
						`;
						}).join('')}
					</tbody>
				</table>
				`}
			</div>
		</div>
	</div>

	<script>
		function changePeriod() {
			const period = document.getElementById('timePeriod').value;
			window.location.href = '/?period=' + period;
		}

		function filterTable() {
			const sourceFilter = document.getElementById('filterSource').value;
			const tierFilter = document.getElementById('filterTier').value;
			const urgencyFilter = document.getElementById('filterUrgency').value;
			const rows = document.querySelectorAll('#feedbackTable tbody tr');
			
			rows.forEach(row => {
				const source = row.getAttribute('data-source');
				const tier = row.getAttribute('data-tier');
				const urgency = row.getAttribute('data-urgency');
				
				const show = (!sourceFilter || source === sourceFilter) &&
							 (!tierFilter || tier === tierFilter) &&
							 (!urgencyFilter || urgency === urgencyFilter);
				
				row.style.display = show ? '' : 'none';
			});
		}

		function toggleExpand() {
			const container = document.getElementById('tableContainer');
			const btn = document.querySelector('.expand-btn');
			if (container.classList.contains('expanded')) {
				container.classList.remove('expanded');
				btn.textContent = 'Expand';
			} else {
				container.classList.add('expanded');
				btn.textContent = 'Collapse';
			}
		}

		async function performSearch() {
			const query = document.getElementById('searchInput').value.trim();
			if (!query) {
				alert('Please enter a search query');
				return;
			}

			const resultsDiv = document.getElementById('searchResults');
			resultsDiv.innerHTML = '<p>Searching...</p>';
			resultsDiv.classList.add('active');

			try {
				const response = await fetch(\`/api/search?q=\${encodeURIComponent(query)}\`);
				const data = await response.json();

				if (data.results && data.results.length > 0) {
					resultsDiv.innerHTML = \`
						<h3 style="margin-bottom: 15px; color: #1a1a1a;">Found \${data.total} similar feedback entries:</h3>
						\${data.results.map(result => \`
							<div class="search-result-item">
								<h4>\${result.source} - \${result.user_tier}</h4>
								<div class="similarity">Similarity: \${(result.similarity_score * 100).toFixed(1)}%</div>
								<div class="content">\${result.content}</div>
								<div style="margin-top: 8px; font-size: 11px; color: #6b7280;">
									Sentiment: \${result.sentiment_score}/5 | Pain: \${result.pain_score.toFixed(1)} | \${new Date(result.created_at * 1000).toLocaleString()}
								</div>
							</div>
						\`).join('')}
					\`;
				} else {
					resultsDiv.innerHTML = '<p style="color: #6b7280;">No similar feedback found. Try different keywords.</p>';
				}
			} catch (error) {
				console.error('Search error:', error);
				resultsDiv.innerHTML = '<p style="color: #dc2626;">Error performing search. Please try again.</p>';
			}
		}

		// Auto-refresh every 60 seconds
		setTimeout(() => {
			location.reload();
		}, 60000);
	</script>
</body>
</html>`;
}

