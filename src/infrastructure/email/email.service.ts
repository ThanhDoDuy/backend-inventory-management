import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { AppLoggerService } from '../logger/app-logger.service';
import {
  buildPasswordResetEmail,
  PasswordResetEmailParams,
} from './templates/password-reset.template';

@Injectable()
export class EmailService {
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    const apiKey = this.configService.get<string>('email.resendApiKey');
    this.from =
      this.configService.get<string>('email.from') ??
      'POS System <onboarding@resend.dev>';
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  async sendPasswordReset(
    to: string,
    params: PasswordResetEmailParams,
  ): Promise<void> {
    const { subject, text, html } = buildPasswordResetEmail(params);

    if (!this.resend) {
      this.logger.warn('EmailService.sendPasswordReset', {
        to,
        reason: 'resend_not_configured',
        resetUrl: params.resetUrl,
      });
      return;
    }

    const result = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      text,
      html,
    });

    if (result.error) {
      this.logger.error('EmailService.sendPasswordReset', {
        to,
        error: result.error.message,
      });
      throw new Error(result.error.message);
    }
  }
}
