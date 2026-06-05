import crypto from 'crypto';
import {MongoMemoryServer} from 'mongodb-memory-server';
import mongoose from 'mongoose';

import {ENV} from '../constants/env.js';


let mongoServer: MongoMemoryServer | undefined;

export async function connectTestMongo(): Promise<void> {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
}

export async function disconnectTestMongo(): Promise<void> {
    await mongoose.disconnect();
    await mongoServer?.stop();
    mongoServer = undefined;
}

export async function clearDatabase(): Promise<void> {
    const collections = mongoose.connection.collections;
    await Promise.all(
        Object.values(collections).map((collection) => collection.deleteMany({}))
    );
}

export function signWebhookPayload(
    body: object,
    options?: {timestamp?: number; nonce?: number; secret?: string}
) {
    const timestamp = options?.timestamp ?? Date.now();
    const nonce = options?.nonce ?? Date.now();
    const secret = options?.secret ?? ENV.MERCHANT_SECRET;
    const signature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(body))
        .digest('hex');

    return {
        headers: {
            'x-timestamp': String(timestamp),
            'x-nonce': String(nonce),
            'x-signature': signature,
        },
        timestamp,
        nonce,
    };
}

export const nonceStore = new Set<string>();

export function resetNonceStore(): void {
    nonceStore.clear();
}
