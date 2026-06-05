import {jest} from '@jest/globals';

const mockRedisSet = jest.fn<(...args: unknown[]) => Promise<string | null>>();

jest.unstable_mockModule('../../brokers/redis.js', () => ({
    redisClient: {
        set: mockRedisSet,
        connect: jest.fn(),
        on: jest.fn(),
    },
    connectRedis: jest.fn(),
}));

const {connectTestMongo, disconnectTestMongo, clearDatabase, signWebhookPayload, resetNonceStore, nonceStore} =
    await import('../../test/helpers.js');

const {MerchantModel} = await import('../merchant/model.js');
const {InvoiceModel} = await import('./model.js');
const {invoiceRepository} = await import('./repository.js');
const {Status} = await import('./types.js');
const {ENV} = await import('../../constants/env.js');

function mockRedisNonceCheck(): void {
    mockRedisSet.mockImplementation(async (key: unknown) => {
        const nonceKey = String(key);
        if (nonceStore.has(nonceKey)) {
            return null;
        }
        nonceStore.add(nonceKey);
        return 'OK';
    });
}

describe('InvoiceRepository — fee calculation', () => {
    beforeAll(async () => {
        await connectTestMongo();
    });

    afterAll(async () => {
        await disconnectTestMongo();
    });

    beforeEach(async () => {
        await clearDatabase();
    });

    it('calculates fee and amountToReceive from merchant feePercent', async () => {
        const merchant = await MerchantModel.create({
            name: 'Fee Merchant',
            feePercent: 0.03,
        });

        const result = await invoiceRepository.create({
            amount: 100,
            currency: 'USD',
            merchantId: merchant.id,
        });

        expect(result.fee.toNumber()).toBe(3);
        expect(result.amountToReceive.toNumber()).toBe(97);

        const stored = await InvoiceModel.findById(result.invoiceId);
        expect(stored?.fee).toBe(3);
        expect(stored?.amountToReceive).toBe(97);
        expect(stored?.status).toBe(Status.pending);
    });

    it('uses decimal arithmetic for fractional amounts', async () => {
        const merchant = await MerchantModel.create({
            name: 'Fraction Merchant',
            feePercent: 0.025,
        });

        const result = await invoiceRepository.create({
            amount: 10.55,
            currency: 'EUR',
            merchantId: merchant.id,
        });

        expect(result.fee.toFixed(5)).toBe('0.26375');
        expect(result.amountToReceive.toFixed(5)).toBe('10.28625');
    });

    it('throws 404 when merchant does not exist', async () => {
        await expect(
            invoiceRepository.create({
                amount: 50,
                currency: 'USD',
                merchantId: '507f1f77bcf86cd799439011',
            })
        ).rejects.toMatchObject({
            statusCode: 404,
            message: 'Merchant not found',
        });
    });
});

describe('InvoiceRepository — webhook signature', () => {
    beforeAll(async () => {
        await connectTestMongo();
    });

    afterAll(async () => {
        await disconnectTestMongo();
    });

    beforeEach(async () => {
        await clearDatabase();
        resetNonceStore();
        mockRedisNonceCheck();
    });

    async function createPendingInvoice() {
        const merchant = await MerchantModel.create({
            name: 'Webhook Merchant',
            feePercent: 0.05,
        });

        const {invoiceId} = await invoiceRepository.create({
            amount: 200,
            currency: 'USD',
            merchantId: merchant.id,
        });

        return invoiceId;
    }

    it('accepts a request with valid HMAC-SHA256 signature', async () => {
        const invoiceId = await createPendingInvoice();
        const body = {invoiceId, status: Status.paid};
        const {headers} = signWebhookPayload(body);

        await invoiceRepository.checkWebhook(headers, body);

        const invoice = await InvoiceModel.findById(invoiceId);
        expect(invoice?.status).toBe(Status.paid);
    });

    it('rejects an invalid signature', async () => {
        const invoiceId = await createPendingInvoice();
        const body = {invoiceId, status: Status.paid};
        const {headers} = signWebhookPayload(body);
        const invalidSignature = '0'.repeat(headers['x-signature'].length);

        await expect(
            invoiceRepository.checkWebhook({...headers, 'x-signature': invalidSignature}, body)
        ).rejects.toMatchObject({
            statusCode: 401,
            message: 'Signature is incorrect',
        });
    });

    it('rejects expired timestamps', async () => {
        const invoiceId = await createPendingInvoice();
        const body = {invoiceId, status: Status.paid};
        const expiredTimestamp = Date.now() - ENV.TIMESTAMP_WINDOW - 1;
        const {headers} = signWebhookPayload(body, {timestamp: expiredTimestamp});

        await expect(invoiceRepository.checkWebhook(headers, body)).rejects.toMatchObject({
            message: 'Expired request',
        });
    });

    it('rejects requests without required headers', async () => {
        const body = {invoiceId: '507f1f77bcf86cd799439011', status: Status.paid};

        await expect(invoiceRepository.checkWebhook({}, body)).rejects.toMatchObject({
            message: expect.stringContaining('Missing'),
        });
    });
});

describe('InvoiceRepository — webhook idempotency', () => {
    beforeAll(async () => {
        await connectTestMongo();
    });

    afterAll(async () => {
        await disconnectTestMongo();
    });

    beforeEach(async () => {
        await clearDatabase();
        resetNonceStore();
        mockRedisNonceCheck();
    });

    it('rejects replay of the same nonce', async () => {
        const merchant = await MerchantModel.create({
            name: 'Idempotency Merchant',
            feePercent: 0.02,
        });

        const {invoiceId} = await invoiceRepository.create({
            amount: 150,
            currency: 'USD',
            merchantId: merchant.id,
        });

        const body = {invoiceId, status: Status.paid};
        const {headers} = signWebhookPayload(body, {nonce: 42_424_242});

        await invoiceRepository.checkWebhook(headers, body);

        await expect(invoiceRepository.checkWebhook(headers, body)).rejects.toMatchObject({
            statusCode: 401,
            message: 'Conflict',
        });
    });

    it('does not revert a paid invoice when duplicate paid webhook arrives with a new nonce', async () => {
        const merchant = await MerchantModel.create({
            name: 'Paid Once Merchant',
            feePercent: 0.01,
        });

        const created = await invoiceRepository.create({
            amount: 1000,
            currency: 'USD',
            merchantId: merchant.id,
        });

        const body = {invoiceId: created.invoiceId, status: Status.paid};

        await invoiceRepository.checkWebhook(signWebhookPayload(body, {nonce: 1}).headers, body);
        await invoiceRepository.checkWebhook(signWebhookPayload(body, {nonce: 2}).headers, body);

        const invoice = await InvoiceModel.findById(created.invoiceId);
        expect(invoice?.status).toBe(Status.paid);
        expect(invoice?.amountToReceive).toBe(990);
    });

    it('does not apply paid transition twice for the same invoice', async () => {
        const merchant = await MerchantModel.create({
            name: 'Single Update Merchant',
            feePercent: 0.05,
        });

        const {invoiceId} = await invoiceRepository.create({
            amount: 300,
            currency: 'USD',
            merchantId: merchant.id,
        });

        const body = {invoiceId, status: Status.paid};

        await invoiceRepository.checkWebhook(signWebhookPayload(body, {nonce: 10}).headers, body);
        await invoiceRepository.checkWebhook(signWebhookPayload(body, {nonce: 11}).headers, body);

        const repeatUpdate = await InvoiceModel.updateOne(
            {_id: invoiceId, status: Status.pending},
            {$set: {status: Status.paid}}
        );

        expect(repeatUpdate.matchedCount).toBe(0);
        expect(repeatUpdate.modifiedCount).toBe(0);
    });
});
