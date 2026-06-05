import express from 'express';
import {ENV} from './constants/env.js';
import {invoiceRouter} from './modules/invoice/routes.js';
import {merchantRepository} from './modules/merchant/repository.js';

const app = express();

app.use(express.json());
app.use('/', invoiceRouter);


export async function start() {
    await merchantRepository.create({
        name: 'Test Merchant',
        feePercent: 0.03,
    });
    
    app.listen(ENV.PORT, () => {
        console.log(`Server is running on ${ENV.HOST}:${ENV.PORT}`);
    });
}
