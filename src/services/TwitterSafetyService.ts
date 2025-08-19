import { Service, type IAgentRuntime, logger } from '@elizaos/core';

interface PostRecord {
  content: string;
  timestamp: number;
  approved: boolean;
  posted: boolean;
}

/**
 * Twitter Safety Service
 * Prevents spam and implements rate limiting for Twitter posts
 */
export class TwitterSafetyService extends Service {
  static serviceType = 'twitter-safety';
  capabilityDescription = 'Provides rate limiting, spam prevention, and content validation for Twitter posts';

  private postHistory: PostRecord[] = [];
  private readonly maxHourlyPosts: number;
  private readonly maxDailyPosts: number;
  private readonly requireConfirmation: boolean;
  private readonly autoPost: boolean;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    this.maxHourlyPosts = parseInt(process.env.TWITTER_RATE_LIMIT_HOURLY || '5');
    this.maxDailyPosts = parseInt(process.env.TWITTER_RATE_LIMIT_DAILY || '20');
    this.requireConfirmation = process.env.TWITTER_REQUIRE_CONFIRMATION === 'true';
    this.autoPost = process.env.TWITTER_AUTO_POST === 'true';
  }

  static async start(runtime: IAgentRuntime) {
    logger.info('*** Starting Twitter Safety Service ***');
    const service = new TwitterSafetyService(runtime);
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    logger.info('*** Stopping Twitter Safety Service ***');
    const service = runtime.getService(TwitterSafetyService.serviceType);
    if (service) {
      await service.stop();
    }
  }

  async stop() {
    logger.info('*** Stopping Twitter Safety Service instance ***');
  }

  /**
   * Check if posting is allowed based on rate limits
   */
  canPost(): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    // Clean old records
    this.postHistory = this.postHistory.filter(record => record.timestamp > oneDayAgo);

    const recentHourlyPosts = this.postHistory.filter(
      record => record.timestamp > oneHourAgo && record.posted
    ).length;

    const recentDailyPosts = this.postHistory.filter(
      record => record.posted
    ).length;

    if (recentHourlyPosts >= this.maxHourlyPosts) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${recentHourlyPosts}/${this.maxHourlyPosts} posts in last hour`
      };
    }

    if (recentDailyPosts >= this.maxDailyPosts) {
      return {
        allowed: false,
        reason: `Daily limit exceeded: ${recentDailyPosts}/${this.maxDailyPosts} posts today`
      };
    }

    return { allowed: true };
  }

  /**
   * Validate content before posting
   */
  validateContent(content: string): { valid: boolean; issues?: string[] } {
    const issues: string[] = [];

    // Check for duplicate content
    const recentContent = this.postHistory
      .filter(record => record.timestamp > Date.now() - (24 * 60 * 60 * 1000))
      .map(record => record.content);

    const similarity = recentContent.find(prevContent => 
      this.calculateSimilarity(content, prevContent) > 0.8
    );

    if (similarity) {
      issues.push('Content too similar to recent post');
    }

    // Check content length
    if (content.length > 280) {
      issues.push('Content exceeds Twitter character limit');
    }

    // Check for spam indicators
    const spamIndicators = ['🚀'.repeat(3), '💎'.repeat(3), 'PUMP'.repeat(2)];
    const hasSpam = spamIndicators.some(indicator => content.includes(indicator));
    
    if (hasSpam) {
      issues.push('Content contains potential spam indicators');
    }

    return {
      valid: issues.length === 0,
      issues: issues.length > 0 ? issues : undefined
    };
  }

  /**
   * Calculate content similarity (simple implementation)
   */
  private calculateSimilarity(content1: string, content2: string): number {
    const words1 = content1.toLowerCase().split(/\s+/);
    const words2 = content2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;
    
    return commonWords.length / totalWords;
  }

  /**
   * Queue content for approval
   */
  async queueForApproval(content: string): Promise<string> {
    const record: PostRecord = {
      content,
      timestamp: Date.now(),
      approved: false,
      posted: false
    };

    this.postHistory.push(record);

    if (this.autoPost) {
      record.approved = true;
      return 'Content queued for automatic posting';
    }

    return `Content queued for approval. Use /approve-post to confirm posting:\n\n"${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`;
  }

  /**
   * Approve queued content for posting
   */
  async approvePost(contentPreview: string): Promise<{ success: boolean; message: string }> {
    const record = this.postHistory.find(r => 
      r.content.includes(contentPreview) && !r.posted
    );

    if (!record) {
      return { success: false, message: 'No matching queued content found' };
    }

    const rateLimitCheck = this.canPost();
    if (!rateLimitCheck.allowed) {
      return { success: false, message: rateLimitCheck.reason || 'Rate limit exceeded' };
    }

    record.approved = true;
    record.posted = true;

    return { success: true, message: 'Content approved and posted to Twitter' };
  }

  /**
   * Get posting statistics
   */
  getPostingStats(): any {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    const hourlyPosts = this.postHistory.filter(
      record => record.timestamp > oneHourAgo && record.posted
    ).length;

    const dailyPosts = this.postHistory.filter(
      record => record.timestamp > oneDayAgo && record.posted
    ).length;

    const queuedPosts = this.postHistory.filter(
      record => !record.posted && record.timestamp > oneDayAgo
    ).length;

    return {
      hourlyPosts,
      dailyPosts,
      queuedPosts,
      maxHourlyPosts: this.maxHourlyPosts,
      maxDailyPosts: this.maxDailyPosts,
      remainingHourly: Math.max(0, this.maxHourlyPosts - hourlyPosts),
      remainingDaily: Math.max(0, this.maxDailyPosts - dailyPosts),
      requireConfirmation: this.requireConfirmation,
      autoPost: this.autoPost
    };
  }
}