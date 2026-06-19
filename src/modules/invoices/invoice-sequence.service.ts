import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { AppError, ERRORS } from '../../shared/errors';
import {
  APP,
  formatInvoiceNumber,
} from '../../shared/constants/app.constants';
import { Invoice, InvoiceDocument } from './schemas/invoice.schema';
import {
  SequenceCounter,
  SequenceCounterDocument,
} from './schemas/sequence-counter.schema';

@Injectable()
export class InvoiceSequenceService {
  constructor(
    @InjectModel(SequenceCounter.name)
    private counterModel: Model<SequenceCounterDocument>,
    @InjectModel(Invoice.name)
    private invoiceModel: Model<InvoiceDocument>,
    private readonly logger: AppLoggerService,
  ) {}

  async nextInvoiceNumber(
    tenantId: string,
    session: ClientSession,
  ): Promise<string> {
    await this.ensureCounterSeeded(tenantId, session);

    const doc = await this.counterModel
      .findOneAndUpdate(
        {
          tenant_id: new Types.ObjectId(tenantId),
          name: APP.invoice.sequenceName,
        },
        { $inc: { seq: 1 } },
        { new: true, session },
      )
      .lean();

    if (!doc) {
      throw new AppError(ERRORS.COMMON.INTERNAL_ERROR, {
        message: 'Failed to allocate invoice sequence',
      });
    }

    const invoiceNumber = formatInvoiceNumber(doc.seq);
    this.logger.step('InvoiceSequenceService.nextInvoiceNumber', {
      tenantId,
      seq: doc.seq,
      invoiceNumber,
    });

    return invoiceNumber;
  }

  /**
   * One-time bootstrap per tenant: seed counter from existing invoice count
   * so deploy does not reuse numbers already issued via countDocuments().
   */
  private async ensureCounterSeeded(
    tenantId: string,
    session: ClientSession,
  ): Promise<void> {
    const tenantObjectId = new Types.ObjectId(tenantId);
    const filter = {
      tenant_id: tenantObjectId,
      name: APP.invoice.sequenceName,
    };

    const existing = await this.counterModel
      .findOne(filter)
      .session(session)
      .lean();

    if (existing) {
      return;
    }

    const invoiceCount = await this.invoiceModel.countDocuments(
      { tenant_id: tenantObjectId },
      { session },
    );

    try {
      await this.counterModel.create(
        [
          {
            tenant_id: tenantObjectId,
            name: APP.invoice.sequenceName,
            seq: invoiceCount,
          },
        ],
        { session },
      );
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: number }).code === 11000
    );
  }
}
