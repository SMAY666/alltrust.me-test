import mongoose from 'mongoose';
import {ENV} from '../constants/env.js';


export async function connectMongoDB(): Promise<void> {
    try {
        await mongoose.connect(ENV.MONGO_URL);
        console.log('MongoDB connected');
    } catch (err) {
        throw new Error(`Failed to connect to MongoDB: ${err}`);
    }
}
