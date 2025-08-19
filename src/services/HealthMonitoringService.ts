import { type IAgentRuntime, Service, logger } from '@elizaos/core';

/**
 * Enhanced Health Monitoring Service for Anubis Agent
 * Implements 2025 best practices for agent monitoring and analytics
 */
export class HealthMonitoringService extends Service {
  static serviceType = 'health-monitoring';
  
  capabilityDescription = 'Health monitoring and performance metrics service for Anubis agent';
  
  private healthChecks: Map<string, boolean> = new Map();
  private performanceMetrics: Map<string, number> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private isEnabled: boolean;
  
  constructor(runtime: IAgentRuntime) {
    super(runtime);
    this.isEnabled = process.env.ENABLE_HEALTH_CHECKS === 'true';
    
    if (this.isEnabled) {
      this.initializeHealthChecks();
      this.startMonitoring();
    }
  }

  static async start(runtime: IAgentRuntime): Promise<HealthMonitoringService> {
    logger.info('*** Starting Health Monitoring Service ***');
    const service = new HealthMonitoringService(runtime);
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('*** Stopping Health Monitoring Service ***');
    const service = runtime.getService<HealthMonitoringService>(HealthMonitoringService.serviceType);
    if (service) {
      await service.stop();
    }
  }

  private initializeHealthChecks(): void {
    // Initialize health check statuses
    this.healthChecks.set('database', false);
    this.healthChecks.set('mcp-servers', false);
    this.healthChecks.set('model-providers', false);
    this.healthChecks.set('blockchain-rpcs', false);
    this.healthChecks.set('custom-services', false);
    
    // Initialize performance metrics
    this.performanceMetrics.set('response-time', 0);
    this.performanceMetrics.set('memory-usage', 0);
    this.performanceMetrics.set('active-connections', 0);
    this.performanceMetrics.set('successful-requests', 0);
    this.performanceMetrics.set('failed-requests', 0);
  }

  private startMonitoring(): void {
    const interval = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000');
    
    this.checkInterval = setInterval(async () => {
      await this.performHealthChecks();
      await this.collectPerformanceMetrics();
    }, interval);

    logger.info(`Health monitoring started with ${interval}ms interval`);
  }

  private async performHealthChecks(): Promise<void> {
    try {
      // Check database connectivity
      await this.checkDatabaseHealth();
      
      // Check MCP server status
      await this.checkMCPServersHealth();
      
      // Check model provider availability
      await this.checkModelProvidersHealth();
      
      // Check blockchain RPC endpoints
      await this.checkBlockchainRPCHealth();
      
      // Check custom services
      await this.checkCustomServicesHealth();
      
    } catch (error) {
      logger.error('Health check failed:', error);
    }
  }

  private async checkDatabaseHealth(): Promise<void> {
    try {
      // TODO: Implement actual database health check
      // For now, assume healthy if no errors
      this.healthChecks.set('database', true);
    } catch (error) {
      logger.warn('Database health check failed:', error);
      this.healthChecks.set('database', false);
    }
  }

  private async checkMCPServersHealth(): Promise<void> {
    try {
      // Check if MCP orchestrator service is available
      const mcpService = this.runtime.getService('mcp-orchestrator');
      this.healthChecks.set('mcp-servers', !!mcpService);
    } catch (error) {
      logger.warn('MCP servers health check failed:', error);
      this.healthChecks.set('mcp-servers', false);
    }
  }

  private async checkModelProvidersHealth(): Promise<void> {
    try {
      // Check if we can reach configured model providers
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
      const hasGoogle = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      
      this.healthChecks.set('model-providers', hasOpenAI || hasAnthropic || hasGoogle);
    } catch (error) {
      logger.warn('Model providers health check failed:', error);
      this.healthChecks.set('model-providers', false);
    }
  }

  private async checkBlockchainRPCHealth(): Promise<void> {
    try {
      // Check Solana RPC
      const hasSolanaRPC = !!process.env.SOLANA_RPC_URL;
      // TODO: Add actual RPC ping checks for enabled networks
      
      this.healthChecks.set('blockchain-rpcs', hasSolanaRPC);
    } catch (error) {
      logger.warn('Blockchain RPC health check failed:', error);
      this.healthChecks.set('blockchain-rpcs', false);
    }
  }

  private async checkCustomServicesHealth(): Promise<void> {
    try {
      // Check if custom services are running
      const unifiedTokenService = this.runtime.getService('unified-token');
      const twitterSafetyService = this.runtime.getService('twitter-safety');
      
      this.healthChecks.set('custom-services', !!unifiedTokenService && !!twitterSafetyService);
    } catch (error) {
      logger.warn('Custom services health check failed:', error);
      this.healthChecks.set('custom-services', false);
    }
  }

  private async collectPerformanceMetrics(): Promise<void> {
    try {
      // Collect memory usage
      const memoryUsage = process.memoryUsage();
      this.performanceMetrics.set('memory-usage', memoryUsage.heapUsed / 1024 / 1024); // MB
      
      // TODO: Implement actual performance metric collection
      // For now, set dummy values
      this.performanceMetrics.set('response-time', Math.random() * 1000);
      this.performanceMetrics.set('active-connections', Math.floor(Math.random() * 10));
      
    } catch (error) {
      logger.warn('Performance metrics collection failed:', error);
    }
  }

  /**
   * Get current health status
   */
  public getHealthStatus(): { status: 'healthy' | 'degraded' | 'unhealthy'; checks: Record<string, boolean> } {
    const checks: Record<string, boolean> = {};
    this.healthChecks.forEach((value, key) => {
      checks[key] = value;
    });
    
    const healthyCount = Array.from(this.healthChecks.values()).filter(Boolean).length;
    const totalChecks = this.healthChecks.size;
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyCount === totalChecks) {
      status = 'healthy';
    } else if (healthyCount >= totalChecks * 0.5) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }
    
    return { status, checks };
  }

  /**
   * Get performance metrics
   */
  public getPerformanceMetrics(): Record<string, number> {
    const metricsObj: Record<string, number> = {};
    this.performanceMetrics.forEach((value, key) => {
      metricsObj[key] = value;
    });
    return metricsObj;
  }

  /**
   * Log health status
   */
  public logHealthStatus(): void {
    const health = this.getHealthStatus();
    const metrics = this.getPerformanceMetrics();
    
    logger.info('=== ANUBIS HEALTH STATUS ===');
    logger.info(`Overall Status: ${health.status.toUpperCase()}`);
    logger.info({ checks: health.checks }, 'Component Health:');
    logger.info({ metrics }, 'Performance Metrics:');
    logger.info('===========================');
  }

  /**
   * Record successful request
   */
  public recordSuccessfulRequest(): void {
    const current = this.performanceMetrics.get('successful-requests') || 0;
    this.performanceMetrics.set('successful-requests', current + 1);
  }

  /**
   * Record failed request
   */
  public recordFailedRequest(): void {
    const current = this.performanceMetrics.get('failed-requests') || 0;
    this.performanceMetrics.set('failed-requests', current + 1);
  }

  /**
   * Record response time
   */
  public recordResponseTime(timeMs: number): void {
    // Calculate rolling average
    const current = this.performanceMetrics.get('response-time') || 0;
    const newAverage = (current * 0.9) + (timeMs * 0.1); // Weighted average
    this.performanceMetrics.set('response-time', newAverage);
  }

  public async stop(): Promise<void> {
    logger.info('*** Stopping Health Monitoring Service ***');
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    // Log final health status
    if (this.isEnabled) {
      this.logHealthStatus();
    }
  }
}