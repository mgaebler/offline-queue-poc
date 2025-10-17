/**
 * Mock API Server for testing offline queue
 * Simulates a backend that accepts form submissions with images
 */

export default {
    port: 3001,

    routes: {
        '/api/*': '/$1'
    },

    // Custom middleware
    middlewares: [],

    // Delay responses (optional, for testing)
    delay: 500
}
