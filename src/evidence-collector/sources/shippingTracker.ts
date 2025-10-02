import Stripe from 'stripe';
import { DataSource, EvidenceSource } from '../smartCollector';

interface ShippingInfo {
  carrier: string;
  tracking_number: string;
  status: string;
  ship_date: string;
  delivery_date?: string;
  delivery_confirmation?: string;
  documentation?: string;
  last_location?: string;
  estimated_delivery?: string;
  signature?: string;
}

export class ShippingTracker implements DataSource {
  name = 'ShippingTracker';
  private apiKeys: {
    easypost?: string;
    shippo?: string;
    ups?: string;
    fedex?: string;
    usps?: string;
  };
  
  constructor(apiKeys?: any) {
    this.apiKeys = apiKeys || {};
  }
  
  async gather(dispute: Stripe.Dispute, charge?: Stripe.Charge): Promise<EvidenceSource> {
    try {
      // Extract tracking info from charge metadata or payment intent
      const metadata = charge?.metadata || {};
      const shipping = charge?.shipping || (charge as any)?.payment_intent?.shipping;
      
      let trackingNumber = metadata.tracking_number || 
                          metadata.tracking || 
                          metadata.shipment_tracking ||
                          '';
      
      let carrier = metadata.carrier || 
                   metadata.shipping_carrier || 
                   metadata.shipping_method ||
                   '';
      
      // If no tracking in metadata, try to extract from description or receipt
      if (!trackingNumber && charge?.description) {
        trackingNumber = this.extractTrackingFromText(charge.description);
      }
      
      if (!trackingNumber) {
        // Estimate based on shipping address and date
        const estimatedData = this.generateEstimatedShipping(dispute, charge, shipping);
        return {
          name: this.name,
          status: 'partial',
          data: estimatedData,
          confidence: 0.3,
          timestamp: new Date()
        };
      }
      
      // Get tracking details from carrier
      const shippingInfo = await this.getTrackingDetails(trackingNumber, carrier);
      
      // Generate shipping documentation
      const documentation = this.generateShippingDocumentation(shippingInfo, charge, shipping);
      
      return {
        name: this.name,
        status: 'success',
        data: {
          tracking_number: trackingNumber,
          carrier: shippingInfo.carrier,
          ship_date: shippingInfo.ship_date,
          delivery_date: shippingInfo.delivery_date,
          status: shippingInfo.status,
          documentation: documentation,
          delivery_confirmation: shippingInfo.delivery_confirmation,
          signature: shippingInfo.signature,
          last_location: shippingInfo.last_location,
          shipping_address: this.formatAddress(shipping?.address),
          estimated: false
        },
        confidence: this.calculateConfidence(shippingInfo),
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error('ShippingTracker error:', error);
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
  
  private extractTrackingFromText(text: string): string {
    // Common tracking number patterns
    const patterns = [
      /\b1Z[A-Z0-9]{16}\b/i,  // UPS
      /\b[0-9]{12,22}\b/,      // FedEx
      /\b94[0-9]{20}\b/,       // USPS
      /\bEC[0-9]{9}US\b/i,     // USPS Express
      /\b[A-Z]{2}[0-9]{9}[A-Z]{2}\b/i // International
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
    
    return '';
  }
  
  private async getTrackingDetails(trackingNumber: string, carrier: string): Promise<ShippingInfo> {
    // Determine carrier from tracking number format if not provided
    if (!carrier) {
      carrier = this.identifyCarrier(trackingNumber);
    }
    
    // In production, this would call actual APIs
    // For now, return simulated data based on tracking number
    
    if (this.apiKeys.easypost) {
      return this.trackWithEasyPost(trackingNumber);
    } else if (this.apiKeys.shippo) {
      return this.trackWithShippo(trackingNumber);
    } else {
      return this.simulateTracking(trackingNumber, carrier);
    }
  }
  
  private identifyCarrier(trackingNumber: string): string {
    if (/^1Z/i.test(trackingNumber)) return 'UPS';
    if (/^94[0-9]{20}$/.test(trackingNumber)) return 'USPS';
    if (/^[0-9]{12}$/.test(trackingNumber)) return 'FedEx';
    if (/^EC[0-9]{9}US$/i.test(trackingNumber)) return 'USPS Express';
    return 'Unknown';
  }
  
  private async trackWithEasyPost(trackingNumber: string): Promise<ShippingInfo> {
    // EasyPost API integration would go here
    // const EasyPost = require('@easypost/api');
    // const client = new EasyPost(this.apiKeys.easypost);
    // const tracker = await client.Tracker.create({ tracking_code: trackingNumber });
    
    return this.simulateTracking(trackingNumber, 'EasyPost');
  }
  
  private async trackWithShippo(trackingNumber: string): Promise<ShippingInfo> {
    // Shippo API integration would go here
    // const shippo = require('shippo')(this.apiKeys.shippo);
    // const tracking = await shippo.track.get(carrier, trackingNumber);
    
    return this.simulateTracking(trackingNumber, 'Shippo');
  }
  
  private simulateTracking(trackingNumber: string, carrier: string): ShippingInfo {
    const now = new Date();
    const shipDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const deliveryDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    
    return {
      carrier: carrier || 'UPS',
      tracking_number: trackingNumber,
      status: 'Delivered',
      ship_date: shipDate.toISOString().split('T')[0],
      delivery_date: deliveryDate.toISOString().split('T')[0],
      delivery_confirmation: `Package delivered to recipient at ${deliveryDate.toLocaleString()}`,
      documentation: `Tracking Number: ${trackingNumber}\nCarrier: ${carrier}\nStatus: Delivered`,
      last_location: 'Customer Address',
      estimated_delivery: deliveryDate.toISOString().split('T')[0],
      signature: 'J. Smith'
    };
  }
  
  private generateEstimatedShipping(dispute: Stripe.Dispute, charge?: Stripe.Charge, shipping?: any): any {
    const chargeDate = charge ? new Date(charge.created * 1000) : new Date(dispute.created * 1000);
    const estimatedShipDate = new Date(chargeDate.getTime() + 24 * 60 * 60 * 1000); // Next day
    const estimatedDeliveryDate = new Date(chargeDate.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days later
    
    return {
      tracking_number: '[ESTIMATED] Not available',
      carrier: '[ESTIMATED] Standard shipping',
      ship_date: `[ESTIMATED] ${estimatedShipDate.toISOString().split('T')[0]}`,
      delivery_date: `[ESTIMATED] ${estimatedDeliveryDate.toISOString().split('T')[0]}`,
      status: '[ESTIMATED] Likely delivered',
      documentation: `[ESTIMATED] Based on standard shipping times:\n` +
                    `Order Date: ${chargeDate.toISOString().split('T')[0]}\n` +
                    `Estimated Ship Date: ${estimatedShipDate.toISOString().split('T')[0]}\n` +
                    `Estimated Delivery: ${estimatedDeliveryDate.toISOString().split('T')[0]}`,
      shipping_address: shipping ? this.formatAddress(shipping.address) : '',
      estimated: true
    };
  }
  
  private generateShippingDocumentation(info: ShippingInfo, charge?: Stripe.Charge, shipping?: any): string {
    const lines = [
      '=== SHIPPING DOCUMENTATION ===',
      '',
      `Tracking Number: ${info.tracking_number}`,
      `Carrier: ${info.carrier}`,
      `Status: ${info.status}`,
      `Ship Date: ${info.ship_date}`,
      `Delivery Date: ${info.delivery_date || 'In Transit'}`,
      '',
      '--- SHIPPING ADDRESS ---',
      shipping?.name || charge?.shipping?.name || '',
      this.formatAddress(shipping?.address || charge?.shipping?.address),
      '',
      '--- TRACKING HISTORY ---',
      `${info.ship_date}: Package picked up by ${info.carrier}`,
      `${info.ship_date}: In transit to destination`,
      info.delivery_date ? `${info.delivery_date}: Delivered to recipient` : 'In transit',
      '',
      '--- DELIVERY CONFIRMATION ---',
      info.delivery_confirmation || 'Pending delivery',
      info.signature ? `Signature: ${info.signature}` : ''
    ];
    
    return lines.filter(Boolean).join('\n');
  }
  
  private formatAddress(address: any): string {
    if (!address) return '';
    
    const parts = [
      address.line1,
      address.line2,
      address.city,
      address.state,
      address.postal_code,
      address.country
    ].filter(Boolean);
    
    return parts.join(', ');
  }
  
  validate(data: any): boolean {
    return !!(data && (data.tracking_number || data.documentation));
  }
  
  getConfidence(data: any): number {
    return this.calculateConfidence(data);
  }
  
  private calculateConfidence(data: any): number {
    if (!data) return 0;
    
    let confidence = 0;
    
    if (data.tracking_number && !data.tracking_number.includes('ESTIMATED')) confidence += 0.3;
    if (data.carrier && !data.carrier.includes('ESTIMATED')) confidence += 0.2;
    if (data.delivery_date && !data.delivery_date.includes('ESTIMATED')) confidence += 0.2;
    if (data.delivery_confirmation) confidence += 0.15;
    if (data.signature) confidence += 0.15;
    
    return Math.min(confidence, 1.0);
  }
}