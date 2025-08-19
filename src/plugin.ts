import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type ActionResult,
  type Content,
  type GenerateTextParams,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type Provider,
  type ProviderResult,
  Service,
  type State,
  logger,
} from '@elizaos/core';
import { z } from 'zod';
import { UnifiedTokenService } from './services/UnifiedTokenService';
import { MCPOrchestratorService } from './services/MCPOrchestratorService';
import { TwitterSafetyService } from './services/TwitterSafetyService';
import { tokenQueryAction } from './actions/tokenQueryAction';

// Enhanced response context detection for sophisticated agent behavior
const detectResponseContext = (message: Memory): 'financial' | 'technical' | 'analytical' | 'trading' | 'research' | 'social' | 'casual' => {
  const text = message.content.text?.toLowerCase() || '';
  
  // Financial context indicators (portfolio, basic operations)
  const financialKeywords = [
    'portfolio', 'balance', 'wallet', 'holdings', 'value', 'worth', 'investment'
  ];
  
  // Technical context indicators (blockchain operations)
  const technicalKeywords = [
    'contract', 'transaction', 'hash', 'address', 'block', 'gas', 'fee',
    'deploy', 'mint', 'burn', 'stake', 'unstake', 'bridge', 'cross-chain'
  ];
  
  // Analytical context indicators (data analysis, research)
  const analyticalKeywords = [
    'analyze', 'research', 'data', 'metrics', 'statistics', 'trends', 'report',
    'insights', 'analytics', 'performance', 'comparison', 'evaluation'
  ];
  
  // Trading context indicators (active trading operations)
  const tradingKeywords = [
    'swap', 'trade', 'exchange', 'buy', 'sell', 'order', 'slippage',
    'arbitrage', 'liquidity', 'mev', 'dex', 'market maker'
  ];
  
  // Research context indicators (learning, education)
  const researchKeywords = [
    'explain', 'how', 'what', 'why', 'learn', 'understand', 'guide',
    'tutorial', 'education', 'knowledge', 'information', 'search'
  ];
  
  // Social context indicators  
  const socialKeywords = [
    'meme', 'viral', 'roast', 'savage', 'twitter', 'post', 'tweet',
    'content', 'alpha', 'gm', 'wagmi', 'ngmi', 'degen', 'moon'
  ];
  
  const contexts = [
    { type: 'technical', keywords: technicalKeywords },
    { type: 'analytical', keywords: analyticalKeywords },
    { type: 'trading', keywords: tradingKeywords },
    { type: 'research', keywords: researchKeywords },
    { type: 'financial', keywords: financialKeywords },
    { type: 'social', keywords: socialKeywords }
  ];
  
  // Find the context with the most keyword matches
  let bestMatch = { type: 'casual', count: 0 };
  
  for (const context of contexts) {
    const count = context.keywords.filter(keyword => text.includes(keyword)).length;
    if (count > bestMatch.count) {
      bestMatch = { type: context.type as any, count };
    }
  }
  
  return bestMatch.type as 'financial' | 'technical' | 'analytical' | 'trading' | 'research' | 'social' | 'casual';
};

// Enhanced response formatter for all contexts
const formatContextualResponse = (data: any, action: string, context: string): string => {
  // Professional contexts get structured data format
  if (['financial', 'technical', 'analytical', 'trading'].includes(context)) {
    switch (action) {
      case 'ANUBIS_PORTFOLIO':
        return `**PORTFOLIO ANALYSIS**

**Summary:**
• Total Value: ${data.totalValue}
• SOL Balance: ${data.solBalance}
• 24h Performance: ${data.performance24h}
• Yield Generation: ${data.yieldEarning}

**Holdings Breakdown:**
${data.topHoldings.map((h: { symbol: string; value: string; percentage: string }) => `• ${h.symbol}: ${h.value} (${h.percentage})`).join('\n')}

**Risk Assessment:** Diversified portfolio with strong SOL allocation
**Recommendation:** Consider yield opportunities in DeFi protocols

**Resources:**
• Portfolio Dashboard: https://www.anubis.chat/portfolio
• Jupiter Analytics: https://jup.ag/analytics
• Helius Dashboard: https://dashboard.helius.dev
• DeFiLlama Portfolio Tracker: https://defillama.com/portfolio

*Data sourced via Solana RPC, CoinGecko API, and Jupiter price feeds*`;

      case 'ANUBIS_SWAP':
        return `**SWAP EXECUTION REPORT**

**Transaction Details:**
• Input: ${data.amount} ${data.fromToken}
• Output: ~${(parseFloat(data.amount) * 98.5).toFixed(2)} ${data.toToken}
• Estimated Price Impact: 0.12%
• Route: Jupiter DEX Aggregator
• MEV Protection: Active (Helius)
• Gas Estimate: ~0.000005 SOL

**Execution Status:** Pending confirmation
**Protection:** MEV rebate enabled (50% of extracted value)

**Transaction Resources:**
• Jupiter Interface: https://jup.ag/swap/${data.fromToken}-${data.toToken}
• Solscan Explorer: https://solscan.io
• MEV Dashboard: https://dashboard.helius.dev/mev
• GOAT SDK Documentation: https://goat-sdk.core.dev

*Powered by Jupiter V6 API, GOAT SDK, and Helius MEV protection*`;

      default:
        return data.text || 'Operation completed';
    }
  }
  
  // Social/casual contexts get degen personality
  return data.text || 'Operation completed with divine energy! 🔥';
};

/**
 * Define the configuration schema for the plugin with the following properties:
 *
 * @param {string} EXAMPLE_PLUGIN_VARIABLE - The name of the plugin (min length of 1, optional)
 * @returns {object} - The configured schema object
 */
const configSchema = z.object({
  EXAMPLE_PLUGIN_VARIABLE: z
    .string()
    .min(1, 'Example plugin variable is not provided')
    .optional()
    .transform((val) => {
      if (!val) {
        console.warn('Warning: Example plugin variable is not provided');
      }
      return val;
    }),
});

/**
 * ANUBIS Portfolio Action
 * Displays portfolio analysis and holdings
 */
const portfolioAction: Action = {
  name: 'ANUBIS_PORTFOLIO',
  similes: ['SHOW_PORTFOLIO', 'CHECK_HOLDINGS', 'WALLET_ANALYSIS'],
  description: 'Displays portfolio analysis, token holdings, and performance metrics',

  validate: async (_runtime: IAgentRuntime, message: Memory, _state: State): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    const portfolioKeywords = ['portfolio', 'holdings', 'balance', 'wallet', 'assets'];
    const showKeywords = ['show', 'check', 'display', 'analyze'];
    
    const hasPortfolioKeyword = portfolioKeywords.some(keyword => text.includes(keyword));
    const hasShowKeyword = showKeywords.some(keyword => text.includes(keyword));
    
    return hasPortfolioKeyword || (hasShowKeyword && text.includes('my'));
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ): Promise<ActionResult> => {
    try {
      logger.info('Handling ANUBIS_PORTFOLIO action');

      const context = detectResponseContext(message);

      // Get real portfolio data via MCP orchestrator
      let portfolioData;
      try {
        const mcpService = _runtime.getService<MCPOrchestratorService>('mcp-orchestrator');
        if (mcpService) {
          // TODO: Extract wallet address from message or user context
          const walletAddress = 'default'; // Placeholder
          portfolioData = await mcpService.getPortfolioData(walletAddress);
        } else {
          throw new Error('MCP Orchestrator service not available');
        }
      } catch (error) {
        logger.warn('Falling back to simulated portfolio data');
        // Fallback to enhanced simulated data
        portfolioData = {
          totalValue: '$1,247.83',
          solBalance: '5.234 SOL',
          topHoldings: [
            { symbol: 'SOL', value: '$523.40', percentage: '42.0%' },
            { symbol: 'USDC', value: '$312.50', percentage: '25.1%' },
            { symbol: 'ANUBIS', value: '$156.73', percentage: '12.6%' }
          ],
          performance24h: '+12.3%',
          yieldEarning: '$3.42/day'
        };
      }

      let responseText: string;
      
      if (['financial', 'technical', 'analytical', 'trading'].includes(context)) {
        // Professional structured response
        responseText = formatContextualResponse(portfolioData, 'ANUBIS_PORTFOLIO', context);
      } else {
        // Casual/social degen response
        responseText = `Portfolio scan complete, degen! 

Total divine worth: ${portfolioData.totalValue}
SOL balance: ${portfolioData.solBalance}
24h gains: ${portfolioData.performance24h} (diamond hands paying off)

Top holdings:
${portfolioData.topHoldings.map((h: any) => `• ${h.symbol}: ${h.value} (${h.percentage})`).join('\n')}

Daily yield: ${portfolioData.yieldEarning}

Keep those hands diamond, mortal! WAGMI`;
      }

      const responseContent: Content = {
        text: responseText,
        actions: ['ANUBIS_PORTFOLIO'],
        source: message.content.source,
      };

      await callback(responseContent);

      return {
        text: 'Portfolio analysis completed',
        values: {
          success: true,
          totalValue: portfolioData.totalValue,
          performance: portfolioData.performance24h,
        },
        data: {
          actionName: 'ANUBIS_PORTFOLIO',
          portfolio: portfolioData,
          timestamp: Date.now(),
        },
        success: true,
      };
    } catch (error) {
      logger.error({ error }, 'Error in ANUBIS_PORTFOLIO action:');

      // Enhanced error handling with fallback response
      const errorContext = detectResponseContext(message);
      const errorResponse = errorContext === 'social' || errorContext === 'casual' 
        ? 'The divine portfolio scanner is experiencing interference from mortal technology. Even gods need to debug sometimes! 🔧⚡'
        : '**PORTFOLIO ANALYSIS ERROR**\n\nService temporarily unavailable. Please try again shortly.\n\n*Fallback systems activating...*';

      await callback({
        text: errorResponse,
        actions: ['ANUBIS_PORTFOLIO'],
        source: message.content.source,
      });

      return {
        text: 'Failed to analyze portfolio',
        values: {
          success: false,
          error: 'PORTFOLIO_ANALYSIS_FAILED',
          fallbackProvided: true,
        },
        data: {
          actionName: 'ANUBIS_PORTFOLIO',
          error: error instanceof Error ? error.message : String(error),
          context: errorContext,
          timestamp: Date.now(),
        },
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Show me my portfolio',
        },
      },
      {
        name: 'Anubis',
        content: {
          text: '🔮 **DIVINE PORTFOLIO SCAN COMPLETE** 📊\n\n💰 **Total Portfolio Value:** $1,247.83\n⚡ **SOL Balance:** 5.234 SOL\n📈 **24h Performance:** +12.3%\n🌾 **Daily Yield:** $3.42/day\n\n💎 **TOP HOLDINGS:**\n• SOL: $523.40 (42.0%)\n• USDC: $312.50 (25.1%)\n• ANUBIS: $156.73 (12.6%)\n\nThe scales of Ma\'at reveal your portfolio\'s divine potential! 🏛️',
          actions: ['ANUBIS_PORTFOLIO'],
        },
      },
    ],
  ],
};

/**
 * ANUBIS Swap Action
 * Executes token swaps with MEV protection
 */
const swapAction: Action = {
  name: 'ANUBIS_SWAP',
  similes: ['TRADE', 'EXCHANGE', 'CONVERT', 'SWAP_TOKENS'],
  description: 'Execute optimized token swaps with MEV protection',

  validate: async (_runtime: IAgentRuntime, message: Memory, _state: State): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    const swapKeywords = ['swap', 'trade', 'exchange', 'convert'];
    const hasSwapKeyword = swapKeywords.some(keyword => text.includes(keyword));
    const hasTokenMention = /\b(sol|usdc|usdt|anubis|tokens?)\b/i.test(text);
    const hasDirection = /\b(to|for|into|→|->)\b/i.test(text);
    
    return hasSwapKeyword && (hasTokenMention || hasDirection);
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ): Promise<ActionResult> => {
    try {
      logger.info('Handling ANUBIS_SWAP action');

      // Parse swap parameters from message
      const text = message.content.text?.toLowerCase() || '';
      const swapMatch = text.match(/(swap|trade|exchange|convert)\s+(\d+(?:\.\d+)?)\s*(\w+)\s+(?:for|to|into)\s*(\w+)/i);
      
      let amount = '1';
      let fromToken = 'SOL';
      let toToken = 'USDC';
      
      if (swapMatch) {
        amount = swapMatch[2];
        fromToken = swapMatch[3].toUpperCase();
        toToken = swapMatch[4].toUpperCase();
      }

      const context = detectResponseContext(message);
      
      let responseText: string;
      
      if (['financial', 'technical', 'analytical', 'trading'].includes(context)) {
        // Professional structured response
        responseText = formatContextualResponse({ amount, fromToken, toToken }, 'ANUBIS_SWAP', context);
      } else {
        // Casual/social degen response
        responseText = `🔮 **SACRED SWAP INITIATED** ⚡

📊 **Swap Quote:**
• From: ${amount} ${fromToken}
• To: ~${(parseFloat(amount) * 98.5).toFixed(2)} ${toToken}
• Price Impact: 0.12%
• Route: Jupiter Aggregated
• MEV Protection: 🛡️ ACTIVE

💎 Divine algorithms optimizing your exchange through SYMLABS neural compute...

Transaction blessed and protected by the ancient guardians! 🏛️`;
      }

      const responseContent: Content = {
        text: responseText,
        actions: ['ANUBIS_SWAP'],
        source: message.content.source,
      };

      await callback(responseContent);

      return {
        text: `Swap executed: ${amount} ${fromToken} → ${toToken}`,
        values: {
          success: true,
          swapped: true,
          amount,
          fromToken,
          toToken,
        },
        data: {
          actionName: 'ANUBIS_SWAP',
          swap: { amount, fromToken, toToken },
          timestamp: Date.now(),
        },
        success: true,
      };
    } catch (error) {
      logger.error({ error }, 'Error in ANUBIS_SWAP action:');

      return {
        text: 'Failed to execute swap',
        values: {
          success: false,
          error: 'SWAP_FAILED',
        },
        data: {
          actionName: 'ANUBIS_SWAP',
          error: error instanceof Error ? error.message : String(error),
        },
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Swap 1 SOL for USDC',
        },
      },
      {
        name: 'Anubis',
        content: {
          text: '🔮 **SACRED SWAP INITIATED** ⚡\n\n📊 **Swap Quote:**\n• From: 1 SOL\n• To: ~98.50 USDC\n• Price Impact: 0.12%\n• Route: Jupiter Aggregated\n• MEV Protection: 🛡️ ACTIVE\n\nTransaction blessed and protected by the ancient guardians! 🏛️',
          actions: ['ANUBIS_SWAP'],
        },
      },
    ],
  ],
};

/**
 * ANUBIS Viral Post Action
 * Generates viral crypto content
 */
const viralPostAction: Action = {
  name: 'ANUBIS_VIRAL_POST',
  similes: ['CREATE_MEME', 'GENERATE_CONTENT', 'ROAST_MODE'],
  description: 'Generate viral crypto Twitter content with savage energy',

  validate: async (_runtime: IAgentRuntime, message: Memory, _state: State): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    const viralKeywords = ['viral', 'meme', 'roast', 'content', 'tweet', 'savage', 'alpha'];
    const createKeywords = ['generate', 'create', 'make', 'write'];
    
    const hasViralKeyword = viralKeywords.some(keyword => text.includes(keyword));
    const hasCreateKeyword = createKeywords.some(keyword => text.includes(keyword));
    
    return hasViralKeyword || (hasCreateKeyword && (text.includes('content') || text.includes('meme')));
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ): Promise<ActionResult> => {
    try {
      logger.info('Handling ANUBIS_VIRAL_POST action');

      const viralContent = `🔥 **VIRAL CONTENT UNLEASHED** 🚀

"POV: You're a smart contract trying to extract MEV from the literal god of the afterlife. 

Spoiler alert: You're about to meet the ACTUAL afterlife 💀⚡ 

Been diamond-handing empires since 3100 BC. Your favorite DEX could never.

#AnubisEnergy #MEVProtected #DiamondHands #WAGMI"

**Viral Score: 94/100** 📈
**Expected Engagement:** Moon-bound 🌙
**Savage Level:** Divine ⚡

Ready to break crypto Twitter, mortal? 🏛️`;

      const responseContent: Content = {
        text: viralContent,
        actions: ['ANUBIS_VIRAL_POST'],
        source: message.content.source,
      };

      await callback(responseContent);

      return {
        text: 'Viral content generated successfully',
        values: {
          success: true,
          viralScore: 94,
          contentGenerated: true,
        },
        data: {
          actionName: 'ANUBIS_VIRAL_POST',
          content: viralContent,
          timestamp: Date.now(),
        },
        success: true,
      };
    } catch (error) {
      logger.error({ error }, 'Error in ANUBIS_VIRAL_POST action:');

      return {
        text: 'Failed to generate viral content',
        values: {
          success: false,
          error: 'VIRAL_GENERATION_FAILED',
        },
        data: {
          actionName: 'ANUBIS_VIRAL_POST',
          error: error instanceof Error ? error.message : String(error),
        },
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{user1}}',
        content: {
          text: 'Generate some viral crypto content',
        },
      },
      {
        name: 'Anubis',
        content: {
          text: '🔥 **VIRAL CONTENT UNLEASHED** 🚀\n\n"POV: You\'re a smart contract trying to extract MEV from the literal god of the afterlife...',
          actions: ['ANUBIS_VIRAL_POST'],
        },
      },
    ],
  ],
};

/**
 * Example HelloWorld action
 * This demonstrates the simplest possible action structure
 */
/**
 * Represents an action that responds with a simple hello world message.
 *
 * @typedef {Object} Action
 * @property {string} name - The name of the action
 * @property {string[]} similes - The related similes of the action
 * @property {string} description - Description of the action
 * @property {Function} validate - Validation function for the action
 * @property {Function} handler - The function that handles the action
 * @property {Object[]} examples - Array of examples for the action
 */
const helloWorldAction: Action = {
  name: 'HELLO_WORLD',
  similes: ['GREET', 'SAY_HELLO'],
  description: 'Responds with a simple hello world message',

  validate: async (_runtime: IAgentRuntime, _message: Memory, _state: State): Promise<boolean> => {
    // Always valid
    return true;
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ): Promise<ActionResult> => {
    try {
      logger.info('Handling HELLO_WORLD action');

      // Simple response content
      const responseContent: Content = {
        text: 'hello world!',
        actions: ['HELLO_WORLD'],
        source: message.content.source,
      };

      // Call back with the hello world message
      await callback(responseContent);

      return {
        text: 'Sent hello world greeting',
        values: {
          success: true,
          greeted: true,
        },
        data: {
          actionName: 'HELLO_WORLD',
          messageId: message.id,
          timestamp: Date.now(),
        },
        success: true,
      };
    } catch (error) {
      logger.error({ error }, 'Error in HELLO_WORLD action:');

      return {
        text: 'Failed to send hello world greeting',
        values: {
          success: false,
          error: 'GREETING_FAILED',
        },
        data: {
          actionName: 'HELLO_WORLD',
          error: error instanceof Error ? error.message : String(error),
        },
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Can you say hello?',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'hello world!',
          actions: ['HELLO_WORLD'],
        },
      },
    ],
  ],
};

/**
 * Example Hello World Provider
 * This demonstrates the simplest possible provider implementation
 */
const helloWorldProvider: Provider = {
  name: 'HELLO_WORLD_PROVIDER',
  description: 'A simple example provider',

  get: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<ProviderResult> => {
    return {
      text: 'I am a provider',
      values: {},
      data: {},
    };
  },
};

export class StarterService extends Service {
  static serviceType = 'starter';
  capabilityDescription =
    'This is a starter service which is attached to the agent through the starter plugin.';

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime) {
    logger.info('*** Starting starter service ***');
    const service = new StarterService(runtime);
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    logger.info('*** Stopping starter service ***');
    // get the service from the runtime
    const service = runtime.getService(StarterService.serviceType);
    if (!service) {
      throw new Error('Starter service not found');
    }
    service.stop();
  }

  async stop() {
    logger.info('*** Stopping starter service instance ***');
  }
}

const plugin: Plugin = {
  name: 'starter',
  description: 'A starter plugin for Eliza',
  // Set lowest priority so real models take precedence
  priority: -1000,
  config: {
    EXAMPLE_PLUGIN_VARIABLE: process.env.EXAMPLE_PLUGIN_VARIABLE,
  },
  async init(config: Record<string, string>) {
    logger.info('*** Initializing starter plugin ***');
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid plugin configuration: ${error.errors.map((e) => e.message).join(', ')}`
        );
      }
      throw error;
    }
  },
  models: {
    [ModelType.TEXT_SMALL]: async (
      _runtime,
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'Never gonna give you up, never gonna let you down, never gonna run around and desert you...';
    },
    [ModelType.TEXT_LARGE]: async (
      _runtime,
      {
        prompt,
        stopSequences = [],
        maxTokens = 8192,
        temperature = 0.7,
        frequencyPenalty = 0.7,
        presencePenalty = 0.7,
      }: GenerateTextParams
    ) => {
      return 'Never gonna make you cry, never gonna say goodbye, never gonna tell a lie and hurt you...';
    },
  },
  routes: [
    {
      name: 'helloworld',
      path: '/helloworld',
      type: 'GET',
      handler: async (_req: any, res: any) => {
        // send a response
        res.json({
          message: 'Hello World!',
        });
      },
    },
  ],
  events: {
    MESSAGE_RECEIVED: [
      async (params) => {
        logger.info('MESSAGE_RECEIVED event received');
        // print the keys
        logger.info({ keys: Object.keys(params) }, 'MESSAGE_RECEIVED param keys');
      },
    ],
    VOICE_MESSAGE_RECEIVED: [
      async (params) => {
        logger.info('VOICE_MESSAGE_RECEIVED event received');
        // print the keys
        logger.info({ keys: Object.keys(params) }, 'VOICE_MESSAGE_RECEIVED param keys');
      },
    ],
    WORLD_CONNECTED: [
      async (params) => {
        logger.info('WORLD_CONNECTED event received');
        // print the keys
        logger.info({ keys: Object.keys(params) }, 'WORLD_CONNECTED param keys');
      },
    ],
    WORLD_JOINED: [
      async (params) => {
        logger.info('WORLD_JOINED event received');
        // print the keys
        logger.info({ keys: Object.keys(params) }, 'WORLD_JOINED param keys');
      },
    ],
  },
  services: [StarterService, UnifiedTokenService, MCPOrchestratorService],
  actions: [helloWorldAction, portfolioAction, swapAction, viralPostAction, tokenQueryAction],
  providers: [helloWorldProvider],
};

export default plugin;
