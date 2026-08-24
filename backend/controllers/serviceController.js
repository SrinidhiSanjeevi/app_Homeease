const Service = require("../models/Service");
const Professional = require("../models/Professional");

// GET ALL SERVICES
const getServices = async (req, res) => {
    try {
        const services = await Service.find({});

        return res.status(200).json({
            success: true,
            services
        });
    } catch (error) {
        console.error("GET SERVICES ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong, please try again"
        });
    }
};

// GET ALL PROFESSIONALS
const getProfessionals = async (req, res) => {
    try {
        const { category } = req.query;

        const filter = category ? { category } : {};

        const professionals =
            await Professional.find(filter);

        return res.status(200).json({
            success: true,
            professionals
        });
    } catch (error) {
        console.error("GET PROFESSIONALS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong, please try again"
        });
    }
};

module.exports = {
    getServices,
    getProfessionals
};