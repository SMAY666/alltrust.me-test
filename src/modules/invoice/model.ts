import mongoose from 'mongoose';
import {InvoiceAttributes} from './types.js';

const invoiceSchema = new mongoose.Schema<InvoiceAttributes>({
    merchantId: {type: String, required: true},
    currency: {type: String, required: true},
    amount: {type: Number, required: true},
    fee: {type: Number, required: true},
    amountToReceive: {type: Number, required: true},
    status: {type: String, enum: ['pending', 'paid', 'failed']},
    createdAt: {type: Date, default: Date.now},
    updatedAt: {type: Date, default: Date.now}
});

export const InvoiceModel = mongoose.model<InvoiceAttributes>('Invoice', invoiceSchema);
