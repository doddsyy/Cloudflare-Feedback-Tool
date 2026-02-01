-- Create feedback table with required columns
CREATE TABLE IF NOT EXISTS feedback (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	content TEXT NOT NULL,
	source TEXT NOT NULL,
	user_tier TEXT NOT NULL CHECK(user_tier IN ('Enterprise', 'Pro', 'Free')),
	sentiment_score INTEGER NOT NULL CHECK(sentiment_score >= 1 AND sentiment_score <= 5),
	bot_score REAL NOT NULL CHECK(bot_score >= 0 AND bot_score <= 1),
	pain_score REAL NOT NULL,
	vibe_summary TEXT,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_created_at ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_source ON feedback(source);
CREATE INDEX IF NOT EXISTS idx_user_tier ON feedback(user_tier);
CREATE INDEX IF NOT EXISTS idx_sentiment_score ON feedback(sentiment_score);

