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
            const result = await websim.imageGen({ prompt });
            console.log("Image generated:", result);
            if (result && result.url) {
                setImageUrl(result.url);
            } else {
                setError("Failed to generate image. Unexpected response format.");
            }
        } catch (err) {
            console.error("Error generating image:", err);
            setError(`Error generating image: ${err.message || err}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <h1>{config.appName}</h1>
            <p>{config.description}</p>
            <div>
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter your image prompt"
                    disabled={isLoading}
                />
                <button onClick={handleGenerateImage} disabled={isLoading}>
                    {isLoading ? 'Generating...' : 'Generate Image'}
                </button>
            </div>
            {error && <p style={{ color: 'red' }}>{error}</p>}
            {isLoading && <p>Loading...</p>}
            {imageUrl && <img src={imageUrl} alt="Generated Image" />}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

