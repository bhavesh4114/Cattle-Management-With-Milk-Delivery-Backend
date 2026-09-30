const prisma = require('../config/db');

// Get all active products for User
exports.getActiveProducts = async (req, res) => {
    try {
        const products = await prisma.product.findMany({
            where: { isActive: true }
        });
        res.status(200).json(products);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch products" });
    }
};

// Get single product details
exports.getProductDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await prisma.product.findUnique({
            where: { id: parseInt(id) }
        });
        if (!product) return res.status(404).json({ error: "Product not found" });
        res.status(200).json(product);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch product" });
    }
};

// Admin: Get all products
exports.getAllProducts = async (req, res) => {
    try {
        const adminId = req.admin.id;
        const products = await prisma.product.findMany({
            where: { adminId }
        });
        res.status(200).json(products);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch products" });
    }
};

// Admin: Create product
exports.createProduct = async (req, res) => {
    try {
        const adminId = req.admin.id;
        const { name, image, price, description, size, unit, isActive } = req.body;
        
        const product = await prisma.product.create({
            data: {
                name, image, price: parseFloat(price), description, size, unit, isActive, adminId
            }
        });
        res.status(201).json(product);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create product" });
    }
};

// Admin: Update product
exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, image, price, description, size, unit, isActive } = req.body;

        const product = await prisma.product.update({
            where: { id: parseInt(id) },
            data: { name, image, price: parseFloat(price), description, size, unit, isActive }
        });
        res.status(200).json(product);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update product" });
    }
};

// Admin: Delete product
exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.product.delete({
            where: { id: parseInt(id) }
        });
        res.status(200).json({ message: "Product deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete product" });
    }
};
