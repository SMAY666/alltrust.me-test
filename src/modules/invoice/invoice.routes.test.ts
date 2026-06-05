import {jest} from '@jest/globals';
import express from 'express';
import request from 'supertest';

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
const {invoiceRouter} = await import('./routes.js');
const {Status} = await import('./types.js');
const {HttpError} = await import('../../utils/httpError.js');

function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/', invoiceRouter);
    app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (err instanceof HttpError) {
            res.status(err.statusCode).json({message: err.message});
            return;
        }
        next(err);
    });
    return app;
}

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

describe('Invoice HTTP routes', () => {
    const app = createTestApp();
    let merchantId: string;

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

        const merchant = await MerchantModel.create({
            name: 'HTTP Merchant',
            feePercent: 0.04,
        });
        merchantId = merchant.id;
    });

    it('POST /invoice returns calculated amounts', async () => {
        const response = await request(app)
            .post('/invoice')
            .send({amount: 250, currency: 'USD', merchantId})
            .expect(201);

        expect(response.body).toMatchObject({
            fee: '10',
            amountToReceive: '240',
        });
        expect(response.body.invoiceId).toBeDefined();
    });

    it('GET /invoice/:id returns current status', async () => {
        const created = await request(app)
            .post('/invoice')
            .send({amount: 100, currency: 'USD', merchantId})
            .expect(201);

        const pending = await request(app).get(`/invoice/${created.body.invoiceId}`).expect(200);
        expect(pending.body).toEqual({status: Status.pending});

        const body = {invoiceId: created.body.invoiceId, status: Status.paid};
        const {headers} = signWebhookPayload(body);
        await request(app).post('/webhook').set(headers).send(body).expect(200);

        const paid = await request(app).get(`/invoice/${created.body.invoiceId}`).expect(200);
        expect(paid.body).toEqual({status: Status.paid});
    });

    it('POST /webhook rejects duplicate nonce on replay', async () => {
        const created = await request(app)
            .post('/invoice')
            .send({amount: 100, currency: 'USD', merchantId})
            .expect(201);

        const body = {invoiceId: created.body.invoiceId, status: Status.paid};
        const {headers} = signWebhookPayload(body, {nonce: 999});

        await request(app).post('/webhook').set(headers).send(body).expect(200);
        await request(app).post('/webhook').set(headers).send(body).expect(401);
    });
});
