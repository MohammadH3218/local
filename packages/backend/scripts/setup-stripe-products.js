/**
 * Stripe Product Setup Script
 * Creates the three subscription tiers with monthly billing
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-01-27.acacia',
});

async function setupProducts() {
  console.log('🔧 Setting up Stripe products and prices...\n');

  try {
    // Define the three subscription tiers
    const tiers = [
      {
        name: 'Starter Plan',
        description: 'Perfect for small businesses getting started with AI calling',
        price: 1999, // $19.99 in cents
        limits: '100 minutes, 200 SMS, 300 contacts per month',
        trialDays: 0,
      },
      {
        name: 'Pro Plan',
        description: 'For growing businesses with higher call volumes',
        price: 3999, // $39.99 in cents
        limits: '300 minutes, 600 SMS, 1000 contacts per month',
        trialDays: 14,
      },
      {
        name: 'Max Plan',
        description: 'Enterprise-grade solution for maximum capacity',
        price: 9999, // $99.99 in cents
        limits: '750 minutes, 1500 SMS, 3000 contacts per month',
        trialDays: 0,
      },
    ];

    const priceIds = {};

    for (const tier of tiers) {
      console.log(`Creating ${tier.name}...`);

      // Create the product
      const product = await stripe.products.create({
        name: tier.name,
        description: tier.description,
        metadata: {
          limits: tier.limits,
        },
      });

      console.log(`  ✅ Product created: ${product.id}`);

      // Create the recurring price with monthly billing
      const recurring = {
        interval: 'month',
      };
      if (tier.trialDays && tier.trialDays > 0) {
        recurring.trial_period_days = tier.trialDays;
      }

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: tier.price,
        currency: 'usd',
        recurring,
        metadata: {
          plan_name: tier.name,
        },
      });

      console.log(`  ✅ Price created: ${price.id} ($${tier.price / 100}/month)\n`);

      // Store price IDs by plan name
      const planKey = tier.name.split(' ')[0].toUpperCase(); // STARTER, PRO, MAX
      priceIds[planKey] = price.id;
    }

    // Output the environment variables
    console.log('✨ All products created successfully!\n');
    console.log('📋 Add these to your .env file:\n');
    console.log(`STRIPE_PRICE_STARTER=${priceIds.STARTER}`);
    console.log(`STRIPE_PRICE_PRO=${priceIds.PRO}`);
    console.log(`STRIPE_PRICE_MAX=${priceIds.MAX}`);
    console.log('\n');

    return priceIds;
  } catch (error) {
    console.error('❌ Error setting up products:', error.message);
    throw error;
  }
}

// Run the setup
setupProducts()
  .then((priceIds) => {
    console.log('🎉 Setup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to setup products:', error);
    process.exit(1);
  });
