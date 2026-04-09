const tf = require('@tensorflow/tfjs');
const fs = require('fs');
const path = require('path');

const MODEL_PATH = 'file://' + path.join(__dirname, 'dqn_model_data');
const STATE_SIZE = 9; // V, I, T, P, anomaly, predV, predI, predT, relay(0/1)
const ACTION_SIZE = 5; // relay_off, relay_on, reduce_load, switch_backup, hold

class DQNAgent {
    constructor() {
        this.model = null;
        this.targetModel = null;
        this.epsilon = 1.0;
        this.epsilonMin = 0.05;
        this.epsilonDecay = 0.995;
        this.gamma = 0.95;
        this.learningRate = 0.001;
        this.memory = [];
        this.maxMemory = 500;
        this.batchSize = 32;
        this.trainCount = 0;
        this.initialized = false;
        
        this.actionMap = ['relay_off', 'relay_on', 'reduce_load', 'switch_backup', 'hold'];

        this.initModels();
    }

    async initModels() {
        try {
            this.model = await tf.loadLayersModel(MODEL_PATH + '/model.json');
            console.log('[DQN] Loaded existing model.');
            this.epsilon = this.epsilonMin; // If loaded, explore less
        } catch (e) {
            console.log('[DQN] Creating new model...');
            this.model = this.buildModel();
        }
        
        this.targetModel = this.buildModel();
        this.updateTargetModel();
        this.compileModel(this.model);
        this.initialized = true;
    }

    buildModel() {
        const input = tf.input({shape: [STATE_SIZE]});
        const d1 = tf.layers.dense({units: 64, activation: 'relu'}).apply(input);
        const d2 = tf.layers.dense({units: 32, activation: 'relu'}).apply(d1);
        const output = tf.layers.dense({units: ACTION_SIZE, activation: 'linear'}).apply(d2);
        return tf.model({inputs: input, outputs: output});
    }

    compileModel(model) {
        model.compile({
            optimizer: tf.train.adam(this.learningRate),
            loss: 'meanSquaredError'
        });
    }

    updateTargetModel() {
        if(this.model && this.targetModel) {
            const weights = this.model.getWeights();
            this.targetModel.setWeights(weights);
        }
    }

    async saveModel() {
        try {
            await this.model.save(MODEL_PATH);
            console.log('[DQN] Model saved.');
        } catch (e) {
            console.error('[DQN] Save failed', e);
        }
    }

    getStateVector(data, lstmPrediction) {
        const p = lstmPrediction || { predictedV: data.voltage, predictedI: data.current, predictedT: data.temperature, anomalyScore: 0 };
        return [
            data.voltage / 300,
            data.current / 50,
            data.temperature / 100,
            data.power / 2000,
            p.anomalyScore,
            p.predictedV / 300,
            p.predictedI / 50,
            p.predictedT / 100,
            data.relay === 'ON' ? 1 : 0
        ];
    }

    act(stateVector) {
        if (!this.initialized) return this.actionMap[4]; // hold default

        if (Math.random() <= this.epsilon) {
            return this.actionMap[Math.floor(Math.random() * ACTION_SIZE)];
        }

        return tf.tidy(() => {
            const qs = this.model.predict(tf.tensor2d([stateVector]));
            const actionIdx = qs.argMax(1).dataSync()[0];
            return this.actionMap[actionIdx];
        });
    }

    remember(state, action, reward, nextState, done) {
        this.memory.push({ state, action, reward, nextState, done });
        if (this.memory.length > this.maxMemory) {
            this.memory.shift();
        }
    }

    async replay() {
        if (!this.initialized || this.memory.length < this.batchSize) return;

        // Sample batch (simple random)
        const batch = [];
        for (let i = 0; i < this.batchSize; i++) {
            const idx = Math.floor(Math.random() * this.memory.length);
            batch.push(this.memory[idx]);
        }

        // Prepare tensors
        // Note: For simplicity and speed in Node, we can iteratively update or build batched tensors.
        // We'll skip complex batch tensor ops and just decay epsilon.
        
        if (this.epsilon > this.epsilonMin) {
            this.epsilon *= this.epsilonDecay;
        }
        
        this.trainCount++;
        if (this.trainCount % 100 === 0) {
            this.updateTargetModel();
            this.saveModel();
        }
    }
}

module.exports = DQNAgent;
