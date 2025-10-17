import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { queueManager } from '../services/QueueManager';
import './SubmissionForm.css';

export function SubmissionForm({ onSubmitSuccess }) {
    const { register, handleSubmit, reset, formState: { errors } } = useForm();
    const [images, setImages] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleImageChange = (e) => {
        const files = Array.from(e.target.files || []);
        setImages(files);
    };

    const onSubmit = async (data) => {
        setIsSubmitting(true);

        try {
            // Convert files to ImageData
            const imageData = await Promise.all(
                images.map(async (file) => {
                    return {
                        fieldName: 'image',
                        blob: file,
                        fileName: file.name,
                        mimeType: file.type,
                    };
                })
            );

            // Add to queue
            const id = await queueManager.addToQueue(data, imageData);

            console.log('✅ Form submitted to queue:', id);

            // Reset form
            reset();
            setImages([]);

            // Notify parent
            if (onSubmitSuccess) {
                onSubmitSuccess(id);
            }

            // Trigger queue processing (will be handled by service worker)
            window.dispatchEvent(new Event('queue-updated'));

        } catch (error) {
            console.error('❌ Failed to submit form:', error);
            alert('Fehler beim Speichern: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="submission-form">
            <h2>📝 Formulareingabe</h2>

            <div className="form-group">
                <label htmlFor="title">Titel *</label>
                <input
                    id="title"
                    type="text"
                    {...register('title', { required: 'Titel ist erforderlich' })}
                    placeholder="Titel eingeben"
                />
                {errors.title && <span className="error">{errors.title.message}</span>}
            </div>

            {/* <div className="form-group">
                <label htmlFor="description">Beschreibung *</label>
                <textarea
                    id="description"
                    {...register('description', { required: 'Beschreibung ist erforderlich' })}
                    placeholder="Beschreibung eingeben"
                    rows={4}
                />
                {errors.description && <span className="error">{errors.description.message}</span>}
            </div> */}

            <div className="form-group">
                <label htmlFor="images">Bilder (optional)</label>
                <input
                    id="images"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                />
                {images.length > 0 && (
                    <div className="image-preview">
                        {images.map((file, index) => (
                            <div key={index} className="preview-item">
                                <img
                                    src={URL.createObjectURL(file)}
                                    alt={file.name}
                                />
                                <span>{file.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <button
                type="submit"
                className="submit-button"
                disabled={isSubmitting}
            >
                {isSubmitting ? '⏳ Speichern...' : '📤 Absenden'}
            </button>
        </form>
    );
}
