import {Router} from 'express';

import {createInvoiceRequest, getInvoiceRequest, webhookRequest} from './types.js';
import {invoiceRepository} from './repository.js';
import {HttpError} from '../../utils/httpError.js';


export const invoiceRouter = Router();

invoiceRouter.post('/invoice', async (req: createInvoiceRequest, res) => {
    const created = await invoiceRepository.create(req.body);
    res.status(201).send(created);
});

invoiceRouter.post('/webhook', async (req: webhookRequest, res) => {
    await invoiceRepository.checkWebhook(req.headers, req.body);
    res.status(200).send();
});

invoiceRouter.get('/invoice/:id', async (req: getInvoiceRequest, res) => {
    const invoice = await invoiceRepository.getById(req.params.id);
    if (!invoice) {
        throw new HttpError('Invoice not found', 404);
    }
    res.send({status: invoice.status});
});
