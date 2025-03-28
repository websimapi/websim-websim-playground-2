import React from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import { config } from './config.js';

const App = () => {
    const [prompt, setPrompt] = React.useState('');
    const [imageUrl, setImageUrl] = React.useState(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState(null);

    const handleGenerateImage = async () => {
        if (!prompt.trim()) {
            setError("Please enter a prompt.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setImageUrl(null); // Clear previous image
        try {
            console.log("Generating image for prompt:", prompt);
            // Make sure websim object is available globally
            if (typeof websim === 'undefined' || !websim.imageGen) {
                throw new Error("Websim image generation tool is not available.");
            }
            const result = await websim.imageGen({ prompt });
            console.log("Image generated:", result);
            if (result && result.url) {
                setImageUrl(result.url);
            } else {
                setError("Failed to generate image. Unexpected response format.");
            }
        } catch (err) {
            console.error("Error generating image:", err);
            // Display a more user-friendly error message
            setError(`Error: ${err.message || 'An unknown error occurred during image generation.'}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Added aria-label for accessibility
    // Added key prop for potential future list rendering if needed, though not strictly necessary here.
    return (
        <div key="image-generator">
            <h1>{config.appName}</h1>
            <p>{config.description}</p>
            <div className="input-group">
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter your image prompt"
                    disabled={isLoading}
                    aria-label="Image prompt input"
                />
                <button onClick={handleGenerateImage} disabled={isLoading || !prompt.trim()} aria-live="polite">
                    {isLoading ? 'Generating...' : 'Generate Image'}
                </button>
            </div>
            {error && <p className="error-message" style={{ color: 'red' }}>{error}</p>}
            {/* More explicit loading indicator */}
            {isLoading && <div className="loading-indicator"><p>Loading...</p></div>} 
            {imageUrl && (
                <div className="image-container">
                    <img src={imageUrl} alt="Generated Image based on prompt" />
                 </div>
            )}
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(React.createElement(App)); // Use React.createElement for clarity without JSX outside component scope
} else {
    console.error("Failed to find the root element");
}