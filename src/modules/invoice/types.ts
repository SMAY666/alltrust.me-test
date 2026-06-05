import {Decimal} from 'decimal.js';
import {Request} from 'express';


export enum Status {
    pending = 'pending',
    paid = 'paid',
    failed = 'failed',
};

export type InvoiceAttributes = {
    id: string,
    merchantId: String,
    currency: string,
    amount: Decimal,
    fee: Decimal,
    amountToReceive: Decimal,
    status: Status,
    createdAt: Date,
    updatedAt: Date,
};

export type InvoiceCreationAttributes = {
    amount: number,
    currency: string,
    merchantId: string,
};

export type InvoiceUpdateAttributes = {
    status: Status,
};

export type WebhookBody = {
    invoiceId: string,
    status: Status.paid | Status.failed,
};

// Routes types
export type createInvoiceRequest = Request<{}, {}, InvoiceCreationAttributes>
export type webhookRequest = Request<{}, {}, WebhookBody>;
export type getInvoiceRequest = Request<{id: string}>


