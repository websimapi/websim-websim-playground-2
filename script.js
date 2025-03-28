import React from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import { config } from './config.js';

// --- Websim Socket Setup ---
const room = typeof WebsimSocket !== 'undefined' ? new WebsimSocket() : null;
if (!room) {
    console.error("WebsimSocket not found. Multiplayer features disabled.");
    // Render fallback UI if needed
}
// -------------------------

// LLM System Prompt for CSS Generation
const CSS_SYSTEM_PROMPT = `You are an expert CSS designer. Based on the user's prompt, generate a CSS stylesheet to theme the current web page.
Focus on colors (backgrounds, text, buttons), fonts, and minor layout adjustments like padding or borders.
Target common elements like body, h1, h2, p, button, input, select, and classes like .controls-container, .gallery-item, .input-group, .error-message, .loading-indicator, .gallery-item-info, etc.
Ensure the generated CSS is valid and can reasonably override existing styles.
Respond ONLY with the raw CSS code. Do not include explanations, introductory text, markdown code fences like \`\`\`css ... \`\`\`, or any characters before or after the valid CSS rules.
Example theme prompts: 'dark mode', 'ocean blue', 'forest green', 'minimalist black and white', 'retro vaporwave'.`;

const App = () => {
    // Image Generation State
    const [prompt, setPrompt] = React.useState('');
    const [aspectRatio, setAspectRatio] = React.useState(config.defaultAspectRatio);
    const [currentImageUrl, setCurrentImageUrl] = React.useState(null);
    const [isLoadingImage, setIsLoadingImage] = React.useState(false);
    const [imageError, setImageError] = React.useState(null);

    // Gallery State
    const [galleryImages, setGalleryImages] = React.useState([]);
    const [isGalleryLoading, setIsGalleryLoading] = React.useState(true);

    // Theme Generation State
    const [themePrompt, setThemePrompt] = React.useState('');
    const [currentThemeCss, setCurrentThemeCss] = React.useState('');
    const [isLoadingTheme, setIsLoadingTheme] = React.useState(false);
    const [themeError, setThemeError] = React.useState(null);

    // User State
    const [currentUser, setCurrentUser] = React.useState(null);
    const [isRoomInitialized, setIsRoomInitialized] = React.useState(false);

    // --- Initialize Room and Subscriptions ---
    React.useEffect(() => {
        if (!room) return;

        const initializeRoom = async () => {
            try {
                await room.initialize();
                console.log("Websim room initialized.");
                setIsRoomInitialized(true);

                // --- Set Initial Theme ---
                const initialRoomState = room.roomState;
                if (initialRoomState && initialRoomState[config.themeStateKey]) {
                    console.log("Applying initial theme from room state.");
                    setCurrentThemeCss(initialRoomState[config.themeStateKey]);
                } else {
                    console.log("No initial theme found in room state.");
                }

                // --- Subscribe to Room State Changes (for Theme) ---
                const unsubscribeRoomState = room.subscribeRoomState((roomState) => {
                    console.log("Room state updated:", roomState);
                    if (roomState && roomState[config.themeStateKey]) {
                        console.log("Applying updated theme from room state.");
                        setCurrentThemeCss(roomState[config.themeStateKey]);
                    } else if (roomState && !roomState[config.themeStateKey]) {
                        // Handle theme being reset/cleared
                        console.log("Theme cleared from room state.");
                        setCurrentThemeCss(''); // Reset to default styles
                    }
                });

                // --- Fetch and Subscribe to Gallery Images ---
                const collection = room.collection(config.imageCollectionType);
                setIsGalleryLoading(true);
                const initialImages = collection.getList().reverse();
                setGalleryImages(initialImages);
                setIsGalleryLoading(false);
                console.log("Initial gallery loaded:", initialImages.length, "images");

                const unsubscribeGallery = collection.subscribe((updatedImages) => {
                    console.log("Gallery updated:", updatedImages.length, "images");
                    setGalleryImages(updatedImages.reverse());
                    setIsGalleryLoading(false);
                });

                // Cleanup subscriptions on unmount
                return () => {
                    console.log("Cleaning up subscriptions.");
                    unsubscribeRoomState();
                    unsubscribeGallery();
                };

            } catch (error) {
                console.error("Failed to initialize Websim room:", error);
                // Handle initialization error (e.g., show error message)
                setImageError("Failed to connect to multiplayer service.");
                setThemeError("Failed to connect to multiplayer service.");
            }
        };

        initializeRoom();

    }, [room]); // Re-run only if room instance changes (shouldn't happen often)

    // --- Fetch current user ---
    React.useEffect(() => {
        if (typeof websim !== 'undefined' && websim.auth?.getCurrentUser) {
            websim.auth.getCurrentUser().then(user => {
                setCurrentUser(user);
            }).catch(err => console.error("Error getting current user:", err));
        }
    }, []);

    // --- Image Generation Handler ---
    const handleGenerateImage = async () => {
        if (!prompt.trim()) {
            setImageError("Please enter a prompt.");
            return;
        }
        if (typeof websim === 'undefined' || !websim.imageGen) {
            setImageError("Websim image generation tool is not available.");
            return;
        }
        if (!room || !isRoomInitialized) {
            setImageError("Multiplayer service not connected. Cannot save image.");
            return;
        }

        setIsLoadingImage(true);
        setImageError(null);
        setCurrentImageUrl(null);

        try {
            console.log("Generating image for prompt:", prompt, "with aspect ratio:", aspectRatio);
            const result = await websim.imageGen({ prompt, aspect_ratio: aspectRatio });
            console.log("Image generated:", result);

            if (result && result.url) {
                setCurrentImageUrl(result.url);

                console.log("Saving image record to collection:", config.imageCollectionType);
                await room.collection(config.imageCollectionType).create({
                    prompt: prompt,
                    imageUrl: result.url,
                    aspectRatio: aspectRatio,
                });
                console.log("Image record saved.");

            } else {
                setImageError("Failed to generate image. Unexpected response format.");
            }
        } catch (err) {
            console.error("Error generating image or saving record:", err);
            setImageError(`Error: ${err.message || 'An unknown error occurred.'}`);
        } finally {
            setIsLoadingImage(false);
        }
    };

    // --- Theme Generation Handler ---
    const handleGenerateTheme = async () => {
        if (!themePrompt.trim()) {
            setThemeError("Please enter a theme description.");
            return;
        }
        if (typeof websim === 'undefined' || !websim.chat?.completions?.create) {
            setThemeError("Websim AI chat tool is not available.");
            return;
        }
        if (!room || !isRoomInitialized) {
            setThemeError("Multiplayer service not connected. Cannot apply theme globally.");
            return;
        }

        setIsLoadingTheme(true);
        setThemeError(null);

        try {
            console.log("Generating theme for prompt:", themePrompt);
            const completion = await websim.chat.completions.create({
                messages: [
                    { role: "system", content: CSS_SYSTEM_PROMPT },
                    { role: "user", content: themePrompt },
                ],
            });

            const generatedCss = completion.content?.trim();

            if (generatedCss) {
                console.log("CSS generated:", generatedCss.substring(0, 100) + "..."); // Log snippet
                // Validate CSS basic structure (optional but recommended)
                if (generatedCss.includes('{') && generatedCss.includes('}')) {
                    // Update room state - the subscription will update local state
                    console.log("Updating room state with new theme CSS.");
                    await room.updateRoomState({ [config.themeStateKey]: generatedCss });
                    setThemePrompt(''); // Clear prompt on success
                } else {
                    throw new Error("Generated content doesn't look like valid CSS.");
                }
            } else {
                throw new Error("LLM returned empty content.");
            }

        } catch (err) {
            console.error("Error generating theme or updating room state:", err);
            setThemeError(`Theme generation failed: ${err.message || 'Unknown error'}`);
        } finally {
            setIsLoadingTheme(false);
        }
    };

    // Helper to get avatar URL
    const getAvatarUrl = (username) => `https://images.websim.ai/avatar/${username}`;

    return (
        <div key="image-and-theme-generator">
            {/* Dynamic Theme Styles */}
            <style>{currentThemeCss}</style>

            <h1>{config.appName}</h1>
            <p>{config.description}</p>

            {/* Image Generation Controls */}
            <h2>Generate Image</h2>
            <div className="controls-container">
                <div className="input-group">
                    <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Enter image prompt (e.g., 'a cat riding a skateboard')"
                        disabled={isLoadingImage || !isRoomInitialized}
                        aria-label="Image prompt input"
                    />
                    <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value)}
                        disabled={isLoadingImage || !isRoomInitialized}
                        aria-label="Select aspect ratio"
                    >
                        {config.aspectRatios.map(ratio => (
                            <option key={ratio.value} value={ratio.value}>
                                {ratio.label}
                            </option>
                        ))}
                    </select>
                    <button onClick={handleGenerateImage} disabled={isLoadingImage || !prompt.trim() || !isRoomInitialized} aria-live="polite">
                        {isLoadingImage ? 'Generating...' : 'Generate Image'}
                    </button>
                </div>
            </div>

            {/* Image Error and Loading */}
            {imageError && <p className="error-message">{imageError}</p>}
            {isLoadingImage && (
                <div className="loading-indicator">
                    <div className="spinner"></div>
                    <p>Generating & Saving Image...</p>
                </div>
            )}

            {/* Currently Generated Image */}
            {currentImageUrl && !isLoadingImage && (
                <div className="current-image-section">
                    <h3>Last Generated Image:</h3>
                    <div className="image-container">
                        <img src={currentImageUrl} alt="Most recently generated image" />
                    </div>
                </div>
            )}

            {/* Theme Generation Controls */}
            <h2>Customize Theme (Realtime)</h2>
            <div className="controls-container theme-controls">
                <div className="input-group">
                    <input
                        type="text"
                        value={themePrompt}
                        onChange={(e) => setThemePrompt(e.target.value)}
                        placeholder="Enter theme description (e.g., 'dark mode', 'pastel colors')"
                        disabled={isLoadingTheme || !isRoomInitialized}
                        aria-label="Theme prompt input"
                    />
                    <button onClick={handleGenerateTheme} disabled={isLoadingTheme || !themePrompt.trim() || !isRoomInitialized} aria-live="polite">
                        {isLoadingTheme ? 'Applying Theme...' : 'Generate & Apply Theme'}
                    </button>
                </div>
            </div>

            {/* Theme Error and Loading */}
            {themeError && <p className="error-message">{themeError}</p>}
            {isLoadingTheme && (
                <div className="loading-indicator">
                    <div className="spinner"></div>
                    <p>Generating & Applying Theme...</p>
                </div>
            )}

            {/* Gallery Section */}
            <div className="gallery-section">
                <h2>Image Gallery (Realtime)</h2>
                {isGalleryLoading && <p>Loading gallery...</p>}
                {!isRoomInitialized && <p className="error-message">Gallery requires connection.</p>}
                {isRoomInitialized && !isGalleryLoading && galleryImages.length === 0 && <p>No images generated yet. Create one!</p>}
                {isRoomInitialized && !isGalleryLoading && galleryImages.length > 0 && (
                    <div className="gallery-grid">
                        {galleryImages.map((imgRecord) => (
                            <div key={imgRecord.id} className="gallery-item">
                                <img src={imgRecord.imageUrl} alt={`Generated image for: ${imgRecord.prompt}`} loading="lazy" />
                                <div className="gallery-item-info">
                                    <img
                                        src={getAvatarUrl(imgRecord.username)}
                                        alt={`${imgRecord.username}'s avatar`}
                                        className="avatar"
                                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.marginLeft = '0'; }} // Hide if avatar fails & adjust margin
                                    />
                                    <span className="username">{imgRecord.username}</span>
                                    <p className="prompt-preview" title={imgRecord.prompt}>"{imgRecord.prompt}"</p>
                                    <span className="details">{imgRecord.aspectRatio}</span>
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