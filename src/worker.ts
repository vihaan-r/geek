import { pipeline, env, TextStreamer } from '@huggingface/transformers';

// Disable local models for the web preview so it fetches from the Hugging Face Hub.
// When bundled in an APK, you can set this to true and serve models from the public folder.
env.allowLocalModels = false;

let generator: any = null;

self.addEventListener('message', async (event) => {
  const { type, messages } = event.data;

  if (type === 'init') {
    try {
      self.postMessage({ type: 'status', message: 'Initializing WebGPU...' });
      
      // Load the SmolLM2-135M-Instruct model
      generator = await pipeline('text-generation', 'onnx-community/SmolLM2-135M-Instruct', {
        device: 'webgpu', // Attempt to use WebGPU for hardware acceleration
        progress_callback: (progress: any) => {
          self.postMessage({ type: 'progress', progress });
        }
      });
      self.postMessage({ type: 'ready' });
    } catch (e: any) {
      console.warn("WebGPU initialization failed, falling back to WASM.", e);
      try {
        self.postMessage({ type: 'status', message: 'WebGPU not supported. Falling back to WASM (slower)...' });
        generator = await pipeline('text-generation', 'onnx-community/SmolLM2-135M-Instruct', {
          device: 'wasm',
          progress_callback: (progress: any) => {
            self.postMessage({ type: 'progress', progress });
          }
        });
        self.postMessage({ type: 'ready' });
      } catch (err: any) {
        self.postMessage({ type: 'error', error: err.message });
      }
    }
  } else if (type === 'generate') {
    if (!generator) {
      self.postMessage({ type: 'error', error: 'Model not loaded yet.' });
      return;
    }

    try {
      // Add a system prompt to encourage reasoning tags
      const systemPrompt = `<|im_start|>system\nYou are a highly intelligent AI assistant. Always think step-by-step. Wrap your internal reasoning inside <think> and </think> tags before answering.<|im_end|>\n`;
      
      const prompt = systemPrompt + messages.map((m: any) => `<|im_start|>${m.role}\n${m.content}<|im_end|>`).join('\n') + '\n<|im_start|>assistant\n';

      let generatedText = "";

      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        callback_function: (text: string) => {
          generatedText += text;
          self.postMessage({ type: 'update', text: generatedText });
        }
      });

      await generator(prompt, {
        max_new_tokens: 1024,
        temperature: 0.7,
        top_p: 0.9,
        do_sample: true,
        streamer: streamer,
      });

      self.postMessage({ type: 'complete', text: generatedText });

    } catch (e: any) {
      self.postMessage({ type: 'error', error: e.message });
    }
  }
});
