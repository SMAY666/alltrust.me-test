import mongoose from 'mongoose';
import {MerchantAttributes} from './types.js';


const merchantSchema = new mongoose.Schema<MerchantAttributes>({
   name: {type: String, required: true, unique: true},
   feePercent: {type: Number, required: true},
   createdAt: {type: Date, default: Date.now},
   updatedAt: {type: Date, default: Date.now},
});

export const MerchantModel = mongoose.model<MerchantAttributes>('Merchant', merchantSchema);
