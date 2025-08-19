import {
  type ActionExample,
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  elizaLogger,
  ActionResult
} from '@elizaos/core';
import { UnifiedTokenService } from '../services/UnifiedTokenService';

export const tokenQueryAction: Action = {
  name: 'UNIFIED_TOKEN_QUERY',
  similes: ['TOKEN_INFO', 'PRICE_CHECK', 'TOKEN_STATS', 'MARKET_DATA', 'FIND_TOKEN'],
  description: 'Query comprehensive token information from multiple sources including Jupiter, PumpPortal, Helius, and Solana RPC',
  
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() || '';
    
    const queryKeywords = [
      'price', 'info', 'stats', 'holders', 'market cap', 'mcap',
      'what is', 'tell me about', 'find', 'search', 'token',
      'how much', 'worth', 'value', 'volume', 'liquidity'
    ];
    
    const hasQueryKeyword = queryKeywords.some(keyword => text.includes(keyword));
    
    // Check for token mentions (symbols or names)
    const tokenMentions = /\b(sol|usdc|usdt|btc|eth|msol|ray|orca|bonk|wif|popcat|jup|trump|fartcoin|pump|light|anubis|maga|pepe|doge|shib|sui)\b/i.test(text);
    
    return hasQueryKeyword && (tokenMentions || text.includes('token'));
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const unifiedTokenService = runtime.getService<UnifiedTokenService>('unified-token');
      
      if (!unifiedTokenService) {
        await callback({
          text: 'Token service not available. Unified token data collection is not initialized.',
          error: true
        });
        return { success: false, error: new Error('Unified token service not available') };
      }
      
      const query = message.content.text || '';
      const lowerQuery = query.toLowerCase();
      
      // Extract potential token symbols or names from the query
      const words = query.split(/\s+/);
      const potentialTokens = words.filter(word => 
        word.length >= 2 && word.length <= 10 && /^[a-zA-Z0-9]+$/.test(word)
      );
      
      let results: any[] = [];
      
      // Search for tokens
      for (const term of potentialTokens) {
        const searchResults = unifiedTokenService.searchTokens(term);
        results.push(...searchResults);
      }
      
      // Remove duplicates
      const uniqueResults = results.filter((token, index, arr) => 
        arr.findIndex(t => t.mint === token.mint) === index
      ).slice(0, 5); // Limit to top 5 results
      
      if (uniqueResults.length === 0) {
        await callback({
          text: `I couldn't find any tokens matching "${query}". Try searching with a token symbol like SOL, USDC, or ANUBIS.`
        });
        return { success: true, text: 'No tokens found' };
      }
      
      let response = `🔍 **Token Search Results for "${query}":**

`;
      
      for (const token of uniqueResults) {
        const priceDisplay = token.usdPrice ? `$${token.usdPrice.toFixed(6)}` : 'N/A';
        const mcapDisplay = token.marketCap ? `$${(token.marketCap / 1e6).toFixed(2)}M` : 'N/A';
        const verification = token.isVerified ? '✅ Verified' : '⚠️ Unverified';
        const sourceIconMap: Record<string, string> = {
          'jupiter': '🪐',
          'pumpportal': '🔥', 
          'helius': '💎',
          'solana-rpc': '🌐'
        };
        const sourceIcon = sourceIconMap[token.source] || '📊';
        
        response += `${sourceIcon} **${token.symbol}** (${token.name})
`;
        response += `   📍 \`${token.mint.slice(0, 8)}...${token.mint.slice(-8)}\`
`;
        response += `   💰 Price: ${priceDisplay} | Market Cap: ${mcapDisplay}
`;
        response += `   ${verification} | Holders: ${token.holderCount || 'N/A'}
`;
        
        if (token.cexes && token.cexes.length > 0) {
          response += `   🏦 Exchanges: ${token.cexes.slice(0, 3).join(', ')}${token.cexes.length > 3 ? '...' : ''}
`;
        }
        
        if (token.tags && token.tags.length > 0) {
          response += `   🏷️ Tags: ${token.tags.slice(0, 3).join(', ')}${token.tags.length > 3 ? '...' : ''}
`;
        }
        
        response += `   📊 Source: ${token.source.toUpperCase()}

`;
      }
      
      response += `📈 **Total Coverage:** ${unifiedTokenService.tokenMap.size} unique tokens from multiple sources`;
      
      await callback({
        text: response
      });
      
      return {
        success: true,
        text: response,
        data: {
          action: 'UNIFIED_TOKEN_QUERY',
          query,
          results: uniqueResults,
          totalTokens: unifiedTokenService.tokenMap.size
        }
      };
      
    } catch (error) {
      elizaLogger.error('Token query action failed:', error);
      
      await callback({
        text: `Failed to query token information: ${error.message}`,
        error: true
      });
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  },
  
  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: "What's the price of SOL?" }
      },
      {
        name: 'Anubis',
        content: { 
          text: '🪐 **SOL** (Wrapped SOL)\n📍 `So111111...111112`\n💰 Price: $179.04 | Market Cap: $96,692M\n✅ Verified | Holders: 3,260,972\n🏦 Exchanges: Binance, Bybit, OKX...\n📊 Source: JUPITER',
          action: 'UNIFIED_TOKEN_QUERY'
        }
      }
    ],
    [
      {
        name: '{{user2}}',
        content: { text: 'Find me some pump.fun tokens' }
      },
      {
        name: 'Anubis',
        content: { 
          text: '🔥 **Latest Pump.fun Tokens:**\n\n🔥 **MAGA** (Make America Great Again)\n📍 `CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump`\n💰 Price: $0.000045 | Market Cap: $1.2M\n⚠️ Unverified | Holders: 5,432\n🏷️ Tags: pump.fun\n📊 Source: PUMPPORTAL',
          action: 'UNIFIED_TOKEN_QUERY'
        }
      }
    ],
    [
      {
        name: '{{user3}}',
        content: { text: 'Tell me about ANUBIS token' }
      },
      {
        name: 'Anubis',
        content: { 
          text: '🔱 **ANUBIS** (Anubis Token) - The Sacred Currency of Digital Degens\n📍 `Fu4jQQpU...JmDpump`\n💰 Price: $0.0234 | Market Cap: $2.1M\n⚠️ Unverified | Holders: 1,247\n🏷️ Tags: meme, degen, egyptian\n📊 Source: PUMPPORTAL\n\nThis is MY token, mortal. The sacred currency of the digital afterlife. 💎',
          action: 'UNIFIED_TOKEN_QUERY'
        }
      }
    ]
  ]
};