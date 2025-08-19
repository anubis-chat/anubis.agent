import { Service, elizaLogger, type IAgentRuntime } from '@elizaos/core';
import { Connection, PublicKey } from '@solana/web3.js';
import WebSocket from 'ws';

interface TokenData {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  
  // Market data
  usdPrice?: number;
  marketCap?: number;
  fdv?: number;
  liquidity?: number;
  
  // Verification & metadata
  isVerified?: boolean;
  holderCount?: number;
  cexes?: string[];
  tags?: string[];
  
  // Social & links  
  website?: string;
  twitter?: string;
  telegram?: string;
  
  // Source tracking
  source: 'jupiter' | 'pumpportal' | 'helius' | 'solana-rpc';
  lastUpdated: number;
  
  // Extended metadata
  description?: string;
  supply?: number;
  createdAt?: string;
  creator?: string;
  
  // Trading stats
  volume24h?: number;
  priceChange24h?: number;
  buys24h?: number;
  sells24h?: number;
}

interface PumpPortalToken {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image_uri: string;
  metadata_uri: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  show_name: boolean;
  created_timestamp: number;
  raydium_pool?: string;
  complete: boolean;
  virtual_sol_reserves: number;
  virtual_token_reserves: number;
  total_supply: number;
  real_sol_reserves: number;
  real_token_reserves: number;
  last_trade_timestamp: number;
  king_of_the_hill_timestamp?: number;
  market_cap: number;
  reply_count: number;
  nsfw: boolean;
  creator: string;
  profile_image?: string;
  username?: string;
}

export class UnifiedTokenService extends Service {
  static serviceType = 'unified-token';
  capabilityDescription = 'Comprehensive token data collection from Jupiter, PumpPortal, Helius, and Solana RPC with smart deduplication';
  
  private connection: Connection;
  private pumpPortalWs: WebSocket | null = null;
  public tokenMap = new Map<string, TokenData>();
  private isInitialized = false;
  
  constructor(runtime: IAgentRuntime) {
    super(runtime);
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
    );
  }
  
  async initialize(): Promise<void> {
    elizaLogger.info('🚀 Initializing Unified Token Service...');
    
    try {
      // Collect from multiple sources in parallel
      await Promise.allSettled([
        this.loadJupiterTokens(),
        this.loadPumpPortalTokens(),
        this.loadHeliusTokens(),
        this.loadSolanaRpcTokens()
      ]);
      
      elizaLogger.info(`📊 Unified Token Service initialized with ${this.tokenMap.size} unique tokens`);
      
      // Store in agent memory after all sources are loaded
      await this.storeTokensInMemory();
      
      this.isInitialized = true;
      
    } catch (error) {
      elizaLogger.error('❌ Failed to initialize Unified Token Service:', error);
      throw error;
    }
  }
  
  async loadJupiterTokens(): Promise<void> {
    try {
      elizaLogger.info('📡 Loading tokens from Jupiter Lite API...');
      
      const response = await fetch('https://lite-api.jup.ag/tokens/v2/tag?query=verified');
      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status}`);
      }
      
      const tokens = await response.json() as any[];
      let jupiterCount = 0;
      
      for (const token of tokens) {
        const tokenData: TokenData = {
          mint: token.id,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoURI: token.icon,
          usdPrice: token.usdPrice,
          marketCap: token.mcap,
          fdv: token.fdv,
          liquidity: token.liquidity,
          isVerified: token.isVerified,
          holderCount: token.holderCount,
          cexes: token.cexes || [],
          tags: token.tags || [],
          website: token.website,
          twitter: token.twitter,
          source: 'jupiter',
          lastUpdated: Date.now(),
          supply: token.circSupply,
          volume24h: token.stats24h?.buyVolume + token.stats24h?.sellVolume,
          priceChange24h: token.stats24h?.priceChange,
          buys24h: token.stats24h?.numBuys,
          sells24h: token.stats24h?.numSells
        };
        
        this.addOrUpdateToken(tokenData);
        jupiterCount++;
      }
      
      elizaLogger.info(`✅ Jupiter: Loaded ${jupiterCount} verified tokens`);
      
    } catch (error) {
      elizaLogger.warn('⚠️ Jupiter token loading failed:', error);
    }
  }
  
  async loadPumpPortalTokens(): Promise<void> {
    try {
      elizaLogger.info('🔥 Loading tokens from PumpPortal...');
      
      // Get latest pump.fun tokens via HTTP first
      const response = await fetch('https://frontend-api.pump.fun/coins/king-of-the-hill');
      if (response.ok) {
        const data = await response.json() as any;
        let pumpCount = 0;
        
        for (const token of data) {
          const tokenData: TokenData = {
            mint: token.mint,
            symbol: token.symbol,
            name: token.name,
            decimals: 6, // pump.fun tokens are typically 6 decimals
            logoURI: token.image_uri,
            marketCap: token.market_cap,
            isVerified: false, // pump.fun tokens start unverified
            holderCount: undefined,
            cexes: [],
            tags: ['pump.fun'],
            website: token.website,
            twitter: token.twitter,
            telegram: token.telegram,
            source: 'pumpportal',
            lastUpdated: Date.now(),
            description: token.description,
            supply: token.total_supply,
            createdAt: new Date(token.created_timestamp * 1000).toISOString(),
            creator: token.creator
          };
          
          this.addOrUpdateToken(tokenData);
          pumpCount++;
        }
        
        elizaLogger.info(`✅ PumpPortal: Loaded ${pumpCount} pump.fun tokens`);
      }
      
      // Set up WebSocket for real-time updates
      this.setupPumpPortalWebSocket();
      
    } catch (error) {
      elizaLogger.warn('⚠️ PumpPortal token loading failed:', error);
    }
  }
  
  private setupPumpPortalWebSocket(): void {
    try {
      this.pumpPortalWs = new WebSocket('wss://pumpportal.fun/api/data');
      
      this.pumpPortalWs.on('open', () => {
        elizaLogger.info('🔥 Connected to PumpPortal WebSocket');
        // Subscribe to new token events
        this.pumpPortalWs?.send(JSON.stringify({
          method: 'subscribeNewToken'
        }));
      });
      
      this.pumpPortalWs.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'new_token') {
            this.processPumpPortalUpdate(message.data);
          }
        } catch (error) {
          elizaLogger.warn('Failed to process PumpPortal WebSocket message:', error);
        }
      });
      
      this.pumpPortalWs.on('error', (error) => {
        elizaLogger.warn(`PumpPortal WebSocket error: ${error instanceof Error ? error.message : String(error)}`);
      });
      
      this.pumpPortalWs.on('close', () => {
        elizaLogger.info('PumpPortal WebSocket closed, will reconnect in 30s');
        setTimeout(() => this.setupPumpPortalWebSocket(), 30000);
      });
      
    } catch (error) {
      elizaLogger.warn('Failed to setup PumpPortal WebSocket:', error);
    }
  }
  
  private processPumpPortalUpdate(tokenData: any): void {
    const token: TokenData = {
      mint: tokenData.mint,
      symbol: tokenData.symbol,
      name: tokenData.name,
      decimals: 6,
      logoURI: tokenData.image_uri,
      marketCap: tokenData.market_cap,
      isVerified: false,
      cexes: [],
      tags: ['pump.fun', 'new'],
      website: tokenData.website,
      twitter: tokenData.twitter,
      telegram: tokenData.telegram,
      source: 'pumpportal',
      lastUpdated: Date.now(),
      description: tokenData.description,
      creator: tokenData.creator
    };
    
    this.addOrUpdateToken(token);
    elizaLogger.info(`🔥 New pump.fun token detected: ${token.symbol}`);
  }
  
  async loadHeliusTokens(): Promise<void> {
    try {
      if (!process.env.HELIUS_API_KEY) {
        elizaLogger.warn('⚠️ Helius API key not provided, skipping Helius token data');
        return;
      }
      
      elizaLogger.info('💎 Loading tokens from Helius DAS API...');
      
      // Use Helius DAS API to get comprehensive token metadata
      const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'unified-token-service',
          method: 'searchAssets',
          params: {
            ownerAddress: '',
            tokenType: 'fungible',
            displayOptions: {
              showNativeBalance: true
            },
            limit: 1000
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json() as any;
        let heliusCount = 0;
        
        if (data.result?.items) {
          for (const asset of data.result.items) {
            const tokenData: TokenData = {
              mint: asset.id,
              symbol: asset.content?.metadata?.symbol || 'UNKNOWN',
              name: asset.content?.metadata?.name || 'Unknown Token',
              decimals: asset.token_info?.decimals || 9,
              logoURI: asset.content?.files?.[0]?.uri,
              isVerified: asset.authorities?.some((auth: any) => auth.scopes?.includes('verified')),
              source: 'helius',
              lastUpdated: Date.now(),
              description: asset.content?.metadata?.description,
              supply: asset.token_info?.supply,
              tags: asset.grouping?.map((g: any) => g.group_value) || []
            };
            
            this.addOrUpdateToken(tokenData);
            heliusCount++;
          }
        }
        
        elizaLogger.info(`✅ Helius: Loaded ${heliusCount} tokens with metadata`);
      }
      
    } catch (error) {
      elizaLogger.warn('⚠️ Helius token loading failed:', error);
    }
  }
  
  async loadSolanaRpcTokens(): Promise<void> {
    try {
      elizaLogger.info('🌐 Loading tokens from Solana RPC...');
      
      // Get largest token accounts to find popular tokens
      const largestAccounts = await this.connection.getTokenLargestAccounts(
        new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') // USDC mint for example
      );
      
      let rpcCount = 0;
      
      // This is a simplified example - in practice you'd query multiple known mints
      // or use other Solana RPC methods to discover tokens
      const knownMints = [
        'So11111111111111111111111111111111111111112', // SOL
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
        '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY
        'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
        'Fu4jQQpUnECSVQrVfeeVPpQpXQffM75LL328EJPtpump' // ANUBIS
      ];
      
      for (const mint of knownMints) {
        try {
          const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(mint));
          if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
            const parsed = mintInfo.value.data.parsed;
            
            const tokenData: TokenData = {
              mint: mint,
              symbol: 'UNKNOWN', // RPC doesn't provide symbol directly
              name: 'Unknown Token',
              decimals: parsed.info.decimals,
              source: 'solana-rpc',
              lastUpdated: Date.now(),
              supply: parsed.info.supply
            };
            
            // Only add if not already present from other sources
            if (!this.tokenMap.has(mint)) {
              this.addOrUpdateToken(tokenData);
              rpcCount++;
            }
          }
        } catch (error) {
          // Skip individual token errors
        }
      }
      
      elizaLogger.info(`✅ Solana RPC: Loaded ${rpcCount} tokens`);
      
    } catch (error) {
      elizaLogger.warn('⚠️ Solana RPC token loading failed:', error);
    }
  }
  
  private addOrUpdateToken(newToken: TokenData): void {
    const existing = this.tokenMap.get(newToken.mint);
    
    if (!existing) {
      // New token
      this.tokenMap.set(newToken.mint, newToken);
    } else {
      // Merge with existing token using priority system
      const merged = this.mergeTokenData(existing, newToken);
      this.tokenMap.set(newToken.mint, merged);
    }
  }
  
  private mergeTokenData(existing: TokenData, newToken: TokenData): TokenData {
    // Priority system: Jupiter > PumpPortal > Helius > Solana RPC
    const sourcePriority = {
      'jupiter': 4,
      'pumpportal': 3,
      'helius': 2,
      'solana-rpc': 1
    };
    
    const existingPriority = sourcePriority[existing.source];
    const newPriority = sourcePriority[newToken.source];
    
    // Use higher priority source for core data, but merge additional fields
    const base = newPriority > existingPriority ? newToken : existing;
    
    return {
      ...base,
      // Always use most recent market data regardless of source
      usdPrice: newToken.usdPrice || existing.usdPrice,
      marketCap: newToken.marketCap || existing.marketCap,
      liquidity: newToken.liquidity || existing.liquidity,
      volume24h: newToken.volume24h || existing.volume24h,
      
      // Merge verification data
      isVerified: existing.isVerified || newToken.isVerified,
      holderCount: Math.max(existing.holderCount || 0, newToken.holderCount || 0),
      
      // Merge social links
      website: newToken.website || existing.website,
      twitter: newToken.twitter || existing.twitter,
      telegram: newToken.telegram || existing.telegram,
      
      // Merge exchange listings
      cexes: [...new Set([...(existing.cexes || []), ...(newToken.cexes || [])])],
      
      // Merge tags
      tags: [...new Set([...(existing.tags || []), ...(newToken.tags || [])])],
      
      // Keep track of multiple sources
      lastUpdated: Math.max(existing.lastUpdated, newToken.lastUpdated)
    };
  }
  
  async storeTokensInMemory(): Promise<void> {
    elizaLogger.info(`🧠 Starting token memory storage for ${this.tokenMap.size} tokens...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Filter for important tokens to avoid overwhelming the memory system
    const importantTokens = Array.from(this.tokenMap.values()).filter(token => 
      token.isVerified || 
      (token.holderCount && token.holderCount > 1000) ||
      (token.cexes && token.cexes.length > 0) ||
      (token.marketCap && token.marketCap > 1000000) || // > $1M market cap
      ['SOL', 'USDC', 'USDT', 'ANUBIS', 'JUP', 'RAY', 'ORCA', 'BONK', 'WIF', 'POPCAT'].includes(token.symbol)
    );
    
    elizaLogger.info(`📊 Storing ${importantTokens.length} important tokens out of ${this.tokenMap.size} total`);
    
    for (const token of importantTokens) {
      try {
        const memoryContent = {
          text: `Token: ${token.symbol} (${token.name}) - Address: ${token.mint} - Price: $${token.usdPrice || 'N/A'} - Market Cap: $${token.marketCap ? (token.marketCap / 1e6).toFixed(2) + 'M' : 'N/A'} - Holders: ${token.holderCount || 'N/A'} - Verified: ${token.isVerified ? 'Yes' : 'No'} - Exchanges: ${(token.cexes || []).join(', ') || 'None'} - Tags: ${(token.tags || []).join(', ')} - Source: ${token.source.toUpperCase()}`
        };
        
        await (this.runtime as any).createMemory(memoryContent, 'token_data', true);
        
        successCount++;
        
        if (successCount <= 10) {
          elizaLogger.info(`✅ Stored ${token.symbol} (${token.source}) in memory (${successCount} total)`);
        }
        
      } catch (memoryError) {
        errorCount++;
        if (errorCount <= 5) {
          elizaLogger.warn(`❌ Failed to store ${token.symbol} in memory: ${memoryError instanceof Error ? memoryError.message : String(memoryError)} (Source: ${token.source})`);
        }
      }
    }
    
    elizaLogger.info(`🧠 Token memory storage complete: ${successCount} successful, ${errorCount} failed`);
  }
  
  // Public methods for token queries
  getToken(mint: string): TokenData | undefined {
    return this.tokenMap.get(mint);
  }
  
  searchTokens(query: string): TokenData[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.tokenMap.values()).filter(token =>
      token.symbol.toLowerCase().includes(lowerQuery) ||
      token.name.toLowerCase().includes(lowerQuery) ||
      token.mint.toLowerCase().includes(lowerQuery)
    ).slice(0, 50); // Limit results
  }
  
  getVerifiedTokens(): TokenData[] {
    return Array.from(this.tokenMap.values()).filter(token => token.isVerified);
  }
  
  getTokensBySource(source: TokenData['source']): TokenData[] {
    return Array.from(this.tokenMap.values()).filter(token => token.source === source);
  }
  
  async refreshTokenData(): Promise<void> {
    if (!this.isInitialized) return;
    
    elizaLogger.info('🔄 Refreshing token data from all sources...');
    await this.initialize();
  }
  
  async stop(): Promise<void> {
    if (this.pumpPortalWs) {
      this.pumpPortalWs.close();
      this.pumpPortalWs = null;
    }
    elizaLogger.info('🛑 Unified Token Service stopped');
  }
  
  // Static methods required by Service base class
  static async start(runtime: IAgentRuntime): Promise<UnifiedTokenService> {
    const service = new UnifiedTokenService(runtime);
    await service.initialize();
    return service;
  }
  
  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService<UnifiedTokenService>('unified-token');
    if (service) {
      await service.stop();
    }
  }
}