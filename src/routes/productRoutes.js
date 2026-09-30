const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticateAdmin } = require('../middleware/auth'); // Admin auth

// Public / User Routes
router.get('/active', productController.getActiveProducts);
router.get('/:id/details', productController.getProductDetails);

// Admin Routes
router.get('/', authenticateAdmin, productController.getAllProducts);
router.post('/', authenticateAdmin, productController.createProduct);
router.put('/:id', authenticateAdmin, productController.updateProduct);
router.delete('/:id', authenticateAdmin, productController.deleteProduct);

module.exports = router;
