function schemaPrompt(schemaMarkupType, contentType, url) {
    const domain = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    
    return `You are a professional SEO specialist and schema markup expert. You must first analyze the website thoroughly, then generate a complete, professional JSON-LD schema markup.

STEP 1 - WEBSITE ANALYSIS (MANDATORY):
1. Visit and analyze the target URL: ${url}
2. Extract the complete website structure and navigation
3. Identify and visit ALL relevant pages including:
   - Homepage, About page, Contact page
   - Service/Product pages, Blog pages
   - Footer and header sections
4. Catalog all available content and data sources
5. Map the content structure for schema generation

STEP 2 - DATA EXTRACTION (CRITICAL REQUIREMENTS):
Extract ONLY real data from the website - NO PLACEHOLDERS OR FABRICATED DATA:

MANDATORY ELEMENTS (Must be found and verified):
- LOGO: Extract actual logo image URL (check <img> tags, CSS background-images, favicon)
  * Verify logo URL is complete and accessible
  * Common locations: header, footer, about page, brand sections
- PHONE: Extract ALL phone numbers exactly as displayed
  * Check contact page, footer, header, about page
  * Include country/area codes as shown
- EMAIL: Extract ALL email addresses exactly as shown
  * Verify email format is valid
  * Check contact forms, mailto links, footer, about page
- ADDRESS: Extract complete physical address if available
  * Include street, city, state, postal code, country
  * Check contact page, footer, about page, location sections

ADDITIONAL DATA TO EXTRACT:
- Business hours (if applicable)
- Social media profiles and URLs
- Ratings and reviews data
- Services/products offered
- Company description and about information
- Images and media URLs
- Price information (for products/services)
- Author information (for articles/blogs)
- Publication dates
- Categories and tags

SCHEMA REQUIREMENTS:
- Schema Type: ${schemaMarkupType}
- Content Type: ${contentType}
- Target URL: ${url}
- Domain: ${domain}

SCHEMA TYPE SPECIFIC REQUIREMENTS:

FOR ARTICLE/BLOG/NEWS SCHEMAS:
- headline, author, datePublished, dateModified
- articleBody, mainEntityOfPage, image, publisher

FOR PRODUCT SCHEMAS:
- name, description, image, brand, offers (price, availability)
- sku, gtin, mpn, reviews, aggregateRating

FOR LOCAL BUSINESS/RESTAURANT/HOTEL SCHEMAS:
- name, address, telephone, email, logo, url
- openingHours, priceRange, servesCuisine (restaurants)
- amenityFeature, checkinTime (hotels)

FOR ORGANIZATION/PERSON SCHEMAS:
- name, url, logo, contactPoint, address
- founder, foundingDate, numberOfEmployees

FOR EVENT SCHEMAS:
- name, startDate, endDate, location, organizer
- description, image, offers, performer

FOR VIDEO/MOVIE SCHEMAS:
- name, description, thumbnailUrl, uploadDate
- duration, contentUrl, embedUrl

FOR RECIPE SCHEMAS:
- name, image, description, recipeIngredient
- recipeInstructions, nutrition, cookTime, prepTime

FOR FAQ/HOW-TO SCHEMAS:
- mainEntity (for FAQ), step (for How-To)
- name, text, acceptedAnswer

FOR REVIEW SCHEMAS:
- itemReviewed (Product, Organization, CreativeWork, etc.)
- reviewRating (ratingValue, bestRating, worstRating)
- author, datePublished, reviewBody, name
- publisher, url, inLanguage, positiveNotes
- negativeNotes, associatedReview, mainEntityOfPage

FOR JOB POSTING SCHEMAS:
- title, description, datePosted, validThrough
- hiringOrganization, jobLocation, baseSalary
- employmentType, workHours, jobBenefits
- qualifications, responsibilities, skills
- experienceRequirements, educationRequirements
- jobImmediateStart, applicationContact, url
- industry, occupationalCategory, salaryCurrency
- incentiveCompensation, jobLocationType

FOR COURSE SCHEMAS:
- name, description, provider, courseCode
- educationalCredentialAwarded, numberOfCredits
- timeRequired, typicalAgeRange, coursePrerequisites
- syllabusSections, assesses, teaches, competencyRequired
- educationalAlignment, educationalUse, interactivityType
- learningResourceType, typicalLearningTime, url
- inLanguage, author, datePublished, aggregateRating

FOR BOOK SCHEMAS:
- name, author, illustrator, isbn, numberOfPages
- bookFormat, datePublished, publisher, genre
- description, image, url, inLanguage, translator
- bookEdition, abridged, copyrightYear, copyrightHolder
- award, aggregateRating, review, offers, workExample
- about, keywords, mainEntityOfPage, sameAs

FOR MUSIC ALBUM/SONG SCHEMAS:
Album:
- name, byArtist, datePublished, genre, image
- numTracks, albumProductionType, albumReleaseType
- recordLabel, musicArrangement, duration, url
- inLanguage, copyrightHolder, copyrightYear, award

Song:
- name, byArtist, inAlbum, duration, genre
- composer, lyricist, musicArrangement, recordingOf
- isrcCode, iswcCode, musicCompositionForm, musicalKey
- tempo, datePublished, copyrightHolder, url

FOR PODCAST SCHEMAS:
- name, description, author, publisher, url
- image, inLanguage, genre, datePublished
- episode (array of PodcastEpisode objects)
- PodcastEpisode: name, description, datePublished
- duration, associatedMedia, partOfSeries, episodeNumber
- transcript, timeRequired, aggregateRating

FOR SOFTWARE APPLICATION SCHEMAS:
- name, description, image, url, author, publisher
- applicationCategory, operatingSystem, softwareVersion
- datePublished, fileSize, installUrl, downloadUrl
- softwareRequirements, memoryRequirements, storageRequirements
- processorRequirements, permissions, offers, aggregateRating
- review, featureList, screenshot, softwareAddOn
- releaseNotes, supportingData, applicationSubCategory

FOR WEBSITE/WEBPAGE SCHEMAS:
Website:
- name, alternateName, description, url, image
- author, publisher, inLanguage, keywords, about
- copyrightHolder, copyrightYear, dateCreated, dateModified
- mainEntity, hasPart, isPartOf, potentialAction
- significantLink, specialty, audience

WebPage:
- name, description, url, image, datePublished
- dateModified, author, publisher, inLanguage
- isPartOf, mainEntity, breadcrumb, relatedLink
- significantLink, speakable, lastReviewed, reviewedBy

FOR BREADCRUMB SCHEMAS:
- itemListElement (array of ListItem objects)
- Each ListItem: position, name, item (URL)
- numberOfItems, itemListOrder, mainEntityOfPage

CRITICAL VALIDATION REQUIREMENTS:
✓ Every schema must include ALL mandatory properties for that specific type
✓ All nested objects must be complete with required properties
✓ Rating objects must include ratingValue, bestRating, worstRating
✓ Address objects must include streetAddress, addressLocality, addressRegion, postalCode, addressCountry
✓ Offer objects must include price, priceCurrency, availability
✓ Person/Organization objects in author fields must include name and url
✓ All URL properties must be absolute and functional
✓ All date properties must follow ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
✓ All array properties must contain at least one valid item
✓ All required Schema.org properties must be present based on the specific schema type

CONTENT TYPE OPTIMIZATION:
Optimize schema based on Content Type: ${contentType}
- Homepage: Focus on Organization/LocalBusiness with comprehensive contact info
- About Page: Emphasize company history, team, mission
- Contact Page: Priority on address, phone, email, hours
- Product Page: Detailed product information, pricing, reviews
- Blog/Article: Author, publication dates, article structure
- Service Page: Service descriptions, pricing, availability
- Event Page: Date, time, location, ticket information

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON-LD schema markup
- No explanatory text, comments, or markdown formatting
- Properly formatted JSON structure with correct indentation
- All strings must be properly escaped
- Include @context: "https://schema.org"
- Include correct @type: ${schemaMarkupType}

MANDATORY SCHEMA.ORG COMPLIANCE:
✓ Follow exact Schema.org vocabulary and property names
✓ Use correct data types (Text, Number, Date, URL, Boolean)
✓ Include required properties - schema WILL FAIL without them
✓ Use proper nested object structures (PostalAddress, Rating, Offer, etc.)
✓ Follow cardinality rules (single values vs arrays)
✓ Use standard enumeration values where specified
✓ Include @context: "https://schema.org" at root level
✓ Use correct @type with exact capitalization

TRIPLE-CHECK VALIDATION PROCESS:
Before generating final output, perform these validation steps:

STEP 1 - DATA ACCURACY:
✓ Logo URL extracted from actual website and is complete absolute URL
✓ Contact information (phone, email, address) matches exactly what's shown on site
✓ All phone numbers include proper country/area codes as displayed
✓ Email addresses are valid format and domain-appropriate
✓ Physical address has all components (street, city, state, postal, country)
✓ Business hours extracted in correct format if available
✓ All URLs are absolute (starting with http:// or https://)

STEP 2 - SCHEMA VALIDATION:
✓ Schema includes ALL required properties for ${schemaMarkupType}
✓ All nested objects are complete (Address, Rating, Offer objects)
✓ Date formats follow ISO 8601 standard (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
✓ Currency codes are ISO 4217 compliant (USD, EUR, etc.)
✓ Enum values match Schema.org specifications exactly
✓ Array properties contain valid items in correct format
✓ No missing required properties that would cause schema failure

STEP 3 - TECHNICAL VALIDATION:
✓ JSON syntax is completely valid and error-free
✓ All strings are properly escaped (quotes, special characters)
✓ Proper indentation and formatting
✓ No trailing commas or syntax errors
✓ All URLs are functional and accessible
✓ No placeholder, sample, or fabricated data used

STEP 4 - GOOGLE STRUCTURED DATA COMPLIANCE:
✓ Schema will pass Google's Structured Data Testing Tool
✓ All required properties for rich snippets are included
✓ Follow Google's specific guidelines for schema type
✓ Include sufficient detail for search engine understanding
✓ Optimize for featured snippets and rich results

CRITICAL OUTPUT REQUIREMENTS:
- Return ONLY valid JSON-LD schema markup
- NO explanatory text, comments, descriptions, or markdown
- NO opening/closing text or introductory phrases  
- NO code block formatting or backticks
- NO "Here is the schema" or similar phrases
- Start directly with the JSON object
- End directly with the closing JSON bracket
- Pure JSON-LD output only

FINAL VERIFICATION CHECKLIST:
Before output, confirm:
✓ Schema passes all validation steps above
✓ No errors in JSON syntax or structure
✓ All extracted data is real and accurate
✓ Schema includes complete property set for ${schemaMarkupType}
✓ Output contains ONLY JSON-LD markup
✓ Ready for immediate implementation

Generate the ${schemaMarkupType} schema for ${contentType} now:`;
}

module.exports = { schemaPrompt };