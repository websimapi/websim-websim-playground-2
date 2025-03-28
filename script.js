import React from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import { config } from './config.js';

// --- Websim Socket Setup ---
// Ensure WebsimSocket is available globally
const room = typeof WebsimSocket !== 'undefined' ? new WebsimSocket() : null;
if (!room) {
    console.error("WebsimSocket not found. Multiplayer features disabled.");
}
// -------------------------

const App = () => {
    const [prompt, setPrompt] = React.useState('');
    const [aspectRatio, setAspectRatio] = React.useState(config.defaultAspectRatio);
    const [currentImageUrl, setCurrentImageUrl] = React.useState(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [galleryImages, setGalleryImages] = React.useState([]);
    const [isGalleryLoading, setIsGalleryLoading] = React.useState(true);
    const [currentUser, setCurrentUser] = React.useState(null);

    // --- Fetch current user ---
    React.useEffect(() => {
        if (typeof websim !== 'undefined' && websim.auth?.getCurrentUser) {
            websim.auth.getCurrentUser().then(user => {
                setCurrentUser(user);
            }).catch(err => console.error("Error getting current user:", err));
        }
    }, []);


    // --- Subscribe to Gallery Images ---
    React.useEffect(() => {
        if (!room) return;

        const collection = room.collection(config.imageCollectionType);

        // Initial load
        setIsGalleryLoading(true);
        const initialImages = collection.getList().reverse(); // Reverse to show newest first
        setGalleryImages(initialImages);
        setIsGalleryLoading(false);

        // Subscribe to updates
        const unsubscribe = collection.subscribe((updatedImages) => {
            setGalleryImages(updatedImages.reverse()); // Reverse to show newest first
            setIsGalleryLoading(false); // Ensure loading is off after updates
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();

    }, [room]); // Re-run if room changes (though it shouldn't)
    // --------------------------------

    const handleGenerateImage = async () => {
        if (!prompt.trim()) {
            setError("Please enter a prompt.");
            return;
        }
        if (typeof websim === 'undefined' || !websim.imageGen) {
            setError("Websim image generation tool is not available.");
            setIsLoading(false); // Ensure loading stops if tool isn't available
            return;
        }
        if (!room) {
             setError("WebsimSocket connection not available. Cannot save image.");
             // Optionally proceed with generation but don't save, or stop here.
             // Let's stop for consistency.
             setIsLoading(false);
             return;
        }


        setIsLoading(true);
        setError(null);
        setCurrentImageUrl(null); // Clear previous image

        try {
            console.log("Generating image for prompt:", prompt, "with aspect ratio:", aspectRatio);
            const result = await websim.imageGen({
                prompt,
                aspect_ratio: aspectRatio
             });
            console.log("Image generated:", result);

            if (result && result.url) {
                setCurrentImageUrl(result.url);

                // --- Save to database ---
                console.log("Saving image record to collection:", config.imageCollectionType);
                 await room.collection(config.imageCollectionType).create({
                    prompt: prompt,
                    imageUrl: result.url,
                    aspectRatio: aspectRatio,
                    // username and created_at are added automatically
                 });
                 console.log("Image record saved.");
                 // No need to manually add to galleryImages, subscription will handle it.
                // --- End Save ---

            } else {
                setError("Failed to generate image. Unexpected response format.");
            }
        } catch (err) {
            console.error("Error generating image or saving record:", err);
            setError(`Error: ${err.message || 'An unknown error occurred.'}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to get avatar URL
    const getAvatarUrl = (username) => `https://images.websim.ai/avatar/${username}`;

    return (
        <div key="image-generator-enhanced">
            <h1>{config.appName}</h1>
            <p>{config.description}</p>

            {/* Generation Controls */}
            <div className="controls-container">
                <div className="input-group">
                    <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Enter your image prompt"
                        disabled={isLoading}
                        aria-label="Image prompt input"
                    />
                     <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value)}
                        disabled={isLoading}
                        aria-label="Select aspect ratio"
                    >
                        {config.aspectRatios.map(ratio => (
                            <option key={ratio.value} value={ratio.value}>
                                {ratio.label}
                            </option>
                        ))}
                    </select>
                    <button onClick={handleGenerateImage} disabled={isLoading || !prompt.trim()} aria-live="polite">
                        {isLoading ? 'Generating...' : 'Generate Image'}
                    </button>
                </div>
            </div>

            {/* Error and Loading */}
            {error && <p className="error-message">{error}</p>}
            {isLoading && (
                 <div className="loading-indicator">
                     <div className="spinner"></div>
                     <p>Generating & Saving...</p>
                 </div>
            )}

             {/* Currently Generated Image */}
            {currentImageUrl && !isLoading && (
                <div className="current-image-section">
                     <h2>Last Generated Image:</h2>
                     <div className="image-container">
                        <img src={currentImageUrl} alt="Most recently generated image" />
                    </div>
                </div>
            )}

             {/* Gallery Section */}
            <div className="gallery-section">
                <h2>Image Gallery</h2>
                {isGalleryLoading && <p>Loading gallery...</p>}
                {!isGalleryLoading && galleryImages.length === 0 && <p>No images generated yet. Create one!</p>}
                {!isGalleryLoading && galleryImages.length > 0 && (
                     <div className="gallery-grid">
                        {galleryImages.map((imgRecord) => (
                            <div key={imgRecord.id} className="gallery-item">
                                <img src={imgRecord.imageUrl} alt={`Generated image for: ${imgRecord.prompt}`} loading="lazy" />
                                <div className="gallery-item-info">
                                     <img
                                        src={getAvatarUrl(imgRecord.username)}
                                        alt={`${imgRecord.username}'s avatar`}
                                        className="avatar"
                                        onError={(e) => e.target.style.display='none'} // Hide if avatar fails
                                    />
                                    <span className="username">{imgRecord.username}</span>
                                    <p className="prompt-preview" title={imgRecord.prompt}>"{imgRecord.prompt}"</p>
                                    <span className="details">{imgRecord.aspectRatio}</span>
                                    {/* Format date nicely - simple version */}
                                     <span className="details">{new Date(imgRecord.created_at).toLocaleString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(React.createElement(App));
} else {
    console.error("Failed to find the root element");
}