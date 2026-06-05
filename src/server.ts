import express, {ErrorRequestHandler, NextFunction} from 'express';
import {ENV} from './constants/env.js';
import {invoiceRouter} from './modules/invoice/routes.js';
import {merchantRepository} from './modules/merchant/repository.js';
import {HttpError} from './utils/httpError.js';

const app = express();

const errorHandler: ErrorRequestHandler = (
    err: HttpError,
    req,
    res,
    next
) => {
    res.status(err.statusCode).json({
        message: err.message,
    });
};

app.use(express.json());

app.use('/', invoiceRouter);
app.use(errorHandler);


export async function start() {
    const merchants = await merchantRepository.getAll();
    if (!merchants.length) {
        const testMerchant = await merchantRepository.create({
            name: 'Test Merchant',
            feePercent: 0.03,
        });
        console.log(`Test merchant ID: ${testMerchant.id}`);
    } else {
        console.log(`Test merchant ID: ${merchants[0].id}`);
    }

    app.listen(ENV.PORT, () => {
        console.log(`Server is running on ${ENV.HOST}:${ENV.PORT}`);
    });
}
