import Stripe from 'stripe';
import { DataSource, EvidenceSource } from '../smartCollector';

export interface DeviceData {
  device_id: string;
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  operating_system: string;
  browser: string;
  screen_resolution: string;
  timezone: string;
  language: string;
  user_agent: string;
  canvas_fingerprint: string;
  webgl_fingerprint: string;
  audio_fingerprint: string;
  fonts_installed: number;
  plugins_count: number;
  touch_support: boolean;
  cookies_enabled: boolean;
  do_not_track: boolean;
  hardware_concurrency: number;
  device_memory: number;
  trust_score: number;
  previous_visits: number;
  account_associations: number;
}

export class DeviceFingerprint implements DataSource {
  name = 'DeviceFingerprint';
  private deviceCache: Map<string, DeviceData> = new Map();
  
  async gather(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<EvidenceSource> {
    try {
      const deviceData = await this.getDeviceFingerprint(charge);
      
      return {
        name: this.name,
        status: deviceData ? 'success' : 'partial',
        data: deviceData,
        confidence: this.getConfidence(deviceData),
        timestamp: new Date()
      };
    } catch (error) {
      return {
        name: this.name,
        status: 'failed',
        data: null,
        error: (error as Error).message,
        confidence: 0,
        timestamp: new Date()
      };
    }
  }
  
  private async getDeviceFingerprint(charge?: Stripe.Charge): Promise<DeviceData | null> {
    // In production, this would integrate with:
    // - FingerprintJS Pro
    // - DeviceAtlas
    // - Seon.io
    // - ThreatMetrix
    // - Custom device tracking
    
    const deviceId = this.extractDeviceId(charge);
    
    if (!deviceId) {
      return this.generateEstimatedDeviceData(charge);
    }
    
    // Check cache
    if (this.deviceCache.has(deviceId)) {
      return this.deviceCache.get(deviceId)!;
    }
    
    const deviceData = await this.lookupDevice(deviceId, charge);
    this.deviceCache.set(deviceId, deviceData);
    
    return deviceData;
  }
  
  private extractDeviceId(charge?: Stripe.Charge): string | null {
    if (!charge) return null;
    
    const metadata = charge.metadata || {};
    const outcome = charge.outcome as any;
    
    return metadata.device_id || 
           metadata.device_fingerprint ||
           metadata.session_id ||
           outcome?.risk_details?.device_id ||
           null;
  }
  
  private async lookupDevice(deviceId: string, charge?: Stripe.Charge): Promise<DeviceData> {
    // Simulate device fingerprint lookup
    const userAgent = charge?.metadata?.user_agent || this.generateUserAgent();
    const deviceType = this.detectDeviceType(userAgent);
    const os = this.detectOS(userAgent);
    const browser = this.detectBrowser(userAgent);
    
    return {
      device_id: deviceId,
      device_type: deviceType,
      operating_system: os,
      browser: browser,
      screen_resolution: this.generateScreenResolution(deviceType),
      timezone: charge?.metadata?.timezone || 'America/New_York',
      language: charge?.metadata?.language || 'en-US',
      user_agent: userAgent,
      canvas_fingerprint: this.generateFingerprint('canvas', deviceId),
      webgl_fingerprint: this.generateFingerprint('webgl', deviceId),
      audio_fingerprint: this.generateFingerprint('audio', deviceId),
      fonts_installed: Math.floor(Math.random() * 50) + 30,
      plugins_count: deviceType === 'desktop' ? Math.floor(Math.random() * 10) : 0,
      touch_support: deviceType !== 'desktop',
      cookies_enabled: true,
      do_not_track: Math.random() < 0.2,
      hardware_concurrency: deviceType === 'desktop' ? 8 : 4,
      device_memory: deviceType === 'desktop' ? 16 : 4,
      trust_score: this.calculateTrustScore(deviceId, charge),
      previous_visits: Math.floor(Math.random() * 20) + 1,
      account_associations: Math.floor(Math.random() * 3) + 1
    };
  }
  
  private generateEstimatedDeviceData(charge?: Stripe.Charge): DeviceData {
    const estimatedUserAgent = this.generateUserAgent();
    const deviceType = 'desktop'; // Most common
    
    return {
      device_id: '[ESTIMATED] Not available',
      device_type: deviceType,
      operating_system: 'Windows 10',
      browser: 'Chrome',
      screen_resolution: '1920x1080',
      timezone: '[ESTIMATED] UTC',
      language: 'en-US',
      user_agent: estimatedUserAgent,
      canvas_fingerprint: '[ESTIMATED]',
      webgl_fingerprint: '[ESTIMATED]',
      audio_fingerprint: '[ESTIMATED]',
      fonts_installed: 45,
      plugins_count: 3,
      touch_support: false,
      cookies_enabled: true,
      do_not_track: false,
      hardware_concurrency: 4,
      device_memory: 8,
      trust_score: 50,
      previous_visits: 1,
      account_associations: 1
    };
  }
  
  private generateUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    ];
    
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }
  
  private detectDeviceType(userAgent: string): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
    if (/iPhone|Android.*Mobile/i.test(userAgent)) return 'mobile';
    if (/iPad|Android(?!.*Mobile)|Tablet/i.test(userAgent)) return 'tablet';
    if (/Windows|Macintosh|Linux/i.test(userAgent)) return 'desktop';
    return 'unknown';
  }
  
  private detectOS(userAgent: string): string {
    if (/Windows NT 10/i.test(userAgent)) return 'Windows 10';
    if (/Windows NT 11/i.test(userAgent)) return 'Windows 11';
    if (/Mac OS X 10_15/i.test(userAgent)) return 'macOS Catalina';
    if (/Mac OS X 11/i.test(userAgent)) return 'macOS Big Sur';
    if (/Mac OS X 12/i.test(userAgent)) return 'macOS Monterey';
    if (/Mac OS X 13/i.test(userAgent)) return 'macOS Ventura';
    if (/iPhone OS 17/i.test(userAgent)) return 'iOS 17';
    if (/Android 14/i.test(userAgent)) return 'Android 14';
    if (/Android 13/i.test(userAgent)) return 'Android 13';
    if (/Linux/i.test(userAgent)) return 'Linux';
    return 'Unknown OS';
  }
  
  private detectBrowser(userAgent: string): string {
    if (/Chrome\/(\d+)/i.test(userAgent) && !/Edg/i.test(userAgent)) {
      const version = userAgent.match(/Chrome\/(\d+)/)?.[1];
      return `Chrome ${version}`;
    }
    if (/Firefox\/(\d+)/i.test(userAgent)) {
      const version = userAgent.match(/Firefox\/(\d+)/)?.[1];
      return `Firefox ${version}`;
    }
    if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) {
      return 'Safari';
    }
    if (/Edg\/(\d+)/i.test(userAgent)) {
      const version = userAgent.match(/Edg\/(\d+)/)?.[1];
      return `Edge ${version}`;
    }
    return 'Unknown Browser';
  }
  
  private generateScreenResolution(deviceType: string): string {
    const resolutions: { [key: string]: string[] } = {
      'desktop': ['1920x1080', '2560x1440', '1366x768', '1440x900', '3840x2160'],
      'mobile': ['375x812', '414x896', '360x640', '390x844', '412x915'],
      'tablet': ['768x1024', '810x1080', '834x1194', '1024x1366'],
      'unknown': ['1920x1080']
    };
    
    const deviceResolutions = resolutions[deviceType];
    return deviceResolutions[Math.floor(Math.random() * deviceResolutions.length)];
  }
  
  private generateFingerprint(type: string, seed: string): string {
    // Generate a deterministic fingerprint based on type and seed
    const hash = this.simpleHash(`${type}-${seed}`);
    return hash.toString(16).padStart(16, '0');
  }
  
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  
  private calculateTrustScore(deviceId: string, charge?: Stripe.Charge): number {
    let score = 50; // Base score
    
    // Increase score for consistent device usage
    if (deviceId && !deviceId.includes('ESTIMATED')) {
      score += 20;
    }
    
    // Check for suspicious patterns
    const metadata = charge?.metadata || {};
    if (metadata.vpn_detected === 'true') score -= 20;
    if (metadata.proxy_detected === 'true') score -= 15;
    if (metadata.tor_detected === 'true') score -= 25;
    
    // Add some randomness
    score += Math.floor(Math.random() * 20) - 10;
    
    return Math.min(100, Math.max(0, score));
  }
  
  validate(data: any): boolean {
    if (!data) return false;
    return !!(data.device_id && data.device_type && data.user_agent);
  }
  
  getConfidence(data: any): number {
    if (!data) return 0;
    
    let confidence = 0.5;
    
    if (data.device_id && !data.device_id.includes('ESTIMATED')) {
      confidence = 0.75;
      
      if (data.trust_score > 70) confidence += 0.15;
      if (data.previous_visits > 5) confidence += 0.05;
      if (data.account_associations > 1) confidence += 0.05;
    }
    
    return Math.min(1, confidence);
  }
}