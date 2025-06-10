# Setup
docker build -f Dockerfile.minimal -t form-filler-minimal .
docker run -p 3000:3000 form-filler-minimal

# Test
curl -X POST http://localhost:3000/fill-form \
  -F "url=http://localhost:3000/test" \
  -F "firstName=Jan" \
  -F "lastName=Kowalski" \
  -F "email=jan@example.com" \
  -F "file=@cv.pdf"