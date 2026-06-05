import crypto from 'crypto';
import {Decimal} from 'decimal.js';
import {merchantRepository} from '../merchant/repository.js';
import {InvoiceModel} from './model.js';
import {InvoiceCreationAttributes, InvoiceUpdateAttributes, Status, WebhookBody} from './types.js';
import {ENV} from '../../constants/env.js';
import {redisClient} from '../../brokers/redis.js';
import {HttpError} from '../../utils/httpError.js';


function getHeader(headers: object, name: string): string | undefined {
    const record = headers as Record<string, string | string[] | undefined>;
    const value = record[name] ?? record[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
}

class InvoiceRepository {
    public async getById(id: string) {
        return await InvoiceModel.findById(id);
    }

    public async create(data: InvoiceCreationAttributes): Promise<{invoiceId: string, amount: Decimal, fee: Decimal, amountToReceive: Decimal}> {
        const merchant = await merchantRepository.getById(data.merchantId);
        if (!merchant) {
            throw new HttpError('Merchant not found', 404);
        }

        const amount = new Decimal(data.amount);
        const fee = amount.mul(merchant.feePercent);
        const amountToReceive = amount.minus(fee);

        const created = await InvoiceModel.create({
            currency: data.currency,
            merchantId: data.merchantId,
            amount,
            fee,
            amountToReceive,
            status: Status.pending,
        });

        return {
            invoiceId: created.id,
            amount,
            fee,
            amountToReceive,
        };
    }

    public async updateStatus(id: string, status: Status) {
        const invoice = await this.getById(id);
        if (!invoice) {
            throw new HttpError('Invoice not found', 404);
        }

        await InvoiceModel.updateOne(
            {_id: id, status: Status.pending},
            {$set: {status, updatedAt: new Date()}}
        );
    }

    public async checkWebhook(headers: object, data: WebhookBody) {
        const timestampHeader = getHeader(headers, 'X-Timestamp');
        const nonceHeader = getHeader(headers, 'X-Nonce');
        const signature = getHeader(headers, 'X-Signature');

        if (!timestampHeader || !nonceHeader || !signature) {
            throw new HttpError('Missing "X-Timestamp" or "X-Nonce" or "X-Signature" header');
        }

        const timestamp = Number(timestampHeader);
        const nonce = Number(nonceHeader);

        if (Math.abs(Date.now() - timestamp) > ENV.TIMESTAMP_WINDOW) {
            throw new HttpError('Expired request');
        }

        const expected = crypto
            .createHmac('sha256', ENV.MERCHANT_SECRET)
            .update(JSON.stringify(data))
            .digest('hex');

        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expected);
        if (
            signatureBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
        ) {
            throw new HttpError('Signature is incorrect', 401);
        }

        const result = await redisClient.set(
            `nonce:${nonce}`,
            '1',
            {
                condition: 'NX',
                expiration: {type: 'EX', value: 300},
            }
        );
        if (!result) {
            throw new HttpError('Conflict', 401);
        }

        await this.updateStatus(data.invoiceId, data.status);
    }
}

export const invoiceRepository = new InvoiceRepository();
