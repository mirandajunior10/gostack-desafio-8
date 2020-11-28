import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer not found');
    }

    const productsIds = products.map(product => ({
      id: product.id,
    }));

    const findProducts = await this.productsRepository.findAllById(productsIds);
    if (!findProducts.length) {
      throw new AppError('Products not found');
    }
    const foundProductsIds = findProducts.map(findProduct => findProduct.id);

    const checkMissingProducts = products.filter(
      product => !foundProductsIds.includes(product.id),
    );

    if (checkMissingProducts.length) {
      throw new AppError(
        `Could not find product ${checkMissingProducts[0].id}`,
      );
    }
    const productsWithNoQuantity = products.filter(
      product =>
        findProducts.filter(findProduct => findProduct.id === product.id)[0]
          .quantity < product.quantity,
    );

    if (productsWithNoQuantity.length) {
      throw new AppError('Found products without available quantities');
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: findProducts.filter(
        findProduct => findProduct.id === product.id,
      )[0].price,
    }));
    const order = await this.ordersRepository.create({
      customer,
      products: serializedProducts,
    });

    const { order_products } = order;

    const updatedProductsQuantity = order_products.map(order_product => ({
      id: order_product.product_id,
      quantity:
        findProducts.filter(
          product => product.id === order_product.product_id,
        )[0].quantity - order_product.quantity,
    }));

    await this.productsRepository.updateQuantity(updatedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
