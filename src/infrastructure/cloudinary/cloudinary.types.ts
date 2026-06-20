export interface SignedProductUploadParams {
  signature: string;
  timestamp: number;
  folder: string;
  public_id: string;
  api_key: string;
  cloud_name: string;
  upload_url: string;
  transformation: string;
}

export type ProductImageUrlVariant = 'thumb' | 'list' | 'detail' | 'zoom';
