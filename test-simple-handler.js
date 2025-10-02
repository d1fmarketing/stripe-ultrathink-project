exports.handler = async (event) => {
  console.log('Simple handler called');
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Simple handler works!' })
  };
};