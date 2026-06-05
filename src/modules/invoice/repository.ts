import crypto from 'crypto';
import {Decimal} from 'decimal.js';
import {merchantRepository} from '../merchant/repository.js';
import {InvoiceModel} from './model.js';
import {InvoiceCreationAttributes, InvoiceUpdateAttributes, Status, WebhookBody} from './types.js';
import {ENV} from '../../constants/env.js';
import {redisClient} from '../../brokers/redis.js';
import {HttpError} from '../../utils/httpError.js';


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

        await InvoiceModel.updateOne({
            id,
            status: Status.pending,
        }, {
            $set: {
                status,
            }
        });
    }

    public async checkWebhook(headers: object, data: WebhookBody) {
        if (!headers['X-Timestamp'] || !headers['X-Nonce'] || !headers['X-Signature']) {
            throw new HttpError('Missing "X-timestamp" or "X-Nonce" or "X-Signature" header');
        }
        const timestamp = Number(headers['X-Timestamp']);
        const nonce = Number(headers['X-Nonce']);

        if (Math.abs(Date.now() - timestamp) > ENV.TIMESTAMP_WINDOW) {
            throw new HttpError('Expired request');
        }

        const signature = headers['X-Signature'];
        const expected = crypto
            .createHmac('SHA-256', ENV.MERCHANT_SECRET)
            .update(JSON.stringify(data))
            .digest('hex');

        const signatureCorrect = crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expected)
        );
        if (!signatureCorrect) {
            throw new HttpError('Signature is incorrect');
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
